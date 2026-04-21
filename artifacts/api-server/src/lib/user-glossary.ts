/**
 * Personal glossary: source matching for prompt hints + strict post-processing on translation output.
 * Does not modify transcription (STT).
 *
 * Strict enforcement (see ensureGlossaryTranslationsFromSource): English leaks, Arabic hemorrhoid→bleed
 * substring map, same-script token swap (prefix/suffix similarity; all matches; Latin/Arabic/Cyrillic/Han),
 * then append fallback.
 */

import { logger } from "./logger.js";

export type GlossaryEnforceMode = "strict" | "hint";

export type UserGlossaryRow = {
  term: string;
  translation: string;
  enforceMode: GlossaryEnforceMode;
  /** Higher runs first in strict passes (tie-break vs longest source match). */
  priority: number;
};

/** Lightweight token-overlap heuristic: skip redundant appends when the model already produced most of the preferred wording. */
const SEMANTIC_TOKEN_MIN_LEN = 2;
const SEMANTIC_OVERLAP_RATIO = 0.65;

const glossaryDbg = logger.child({ module: "user-glossary" });

/** NFC, strip ZW/NBSP, drop straight/curly quotes in surfaces, collapse whitespace — O(n) per call. */
function normalizeSemanticSurface(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[''\u2018\u2019`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Inline replace only when the matched span is non-trivial (avoids noisy 1–2 character edits).
 * Multi-word n-grams: at least two words (each ≥2 chars). Single token: length ≥4.
 */
export function inlineReplaceCandidateAllowed(phrase: string): boolean {
  const t = phrase.trim();
  if (t.length < 2) return false;
  const words = t.split(/\s+/).filter(w => w.length >= 2);
  if (words.length >= 2) return true;
  if (words.length === 1) return words[0]!.length >= 4;
  return t.length >= 4;
}

function stripEdgePunct(tok: string): string {
  return tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** NFC + strip tatweel/ZW so “already applied” checks match MT output variants. */
function normalizeForGlossaryMatch(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\u0640/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

export function translationSemanticallyCloseInOutput(
  outputText: string,
  translation: string,
  where?: "candidate_filter" | "pick_loop" | "append_gate",
): boolean {
  const hay = normalizeSemanticSurface(outputText);
  const hayHyphenStripped = hay.replace(/[-–—]/g, "");
  const toks = normalizeSemanticSurface(translation)
    .split(/\s+/)
    .map(stripEdgePunct)
    .filter(t => t.length >= SEMANTIC_TOKEN_MIN_LEN);
  if (toks.length === 0) return false;
  let hits = 0;
  for (const tok of toks) {
    if (hay.includes(tok)) {
      hits++;
      continue;
    }
    const flat = tok.replace(/[-–—]/g, "");
    if (flat.length >= SEMANTIC_TOKEN_MIN_LEN && hayHyphenStripped.includes(flat)) hits++;
  }
  const ratio = hits / toks.length;
  const close = ratio >= SEMANTIC_OVERLAP_RATIO;
  if (close && logger.isLevelEnabled("debug")) {
    glossaryDbg.debug({
      event: "glossary_semantic_near_match",
      where: where ?? "unspecified",
      tokenTotal: toks.length,
      tokenHits: hits,
      ratio,
    });
  }
  return close;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Comma-separated source aliases (e.g. "heart attack, cardiac arrest"). */
export function parseGlossaryVariations(termField: string): string[] {
  return termField
    .split(",")
    .map(t => t.trim())
    .filter(t => t.length >= 2);
}

/**
 * When manual `priority` is 0 (default / unset), use this tier so longer, more specific rows
 * still order ahead without extra DB fields. Manual priority always sorts first.
 */
function glossaryAutoPriorityTier(row: UserGlossaryRow): number {
  let maxVarLen = 0;
  for (const v of parseGlossaryVariations(row.term)) {
    if (v.length > maxVarLen) maxVarLen = v.length;
  }
  const tLen = Math.min(row.translation.trim().length, 4095);
  return maxVarLen * 4096 + tLen;
}

function glossaryStableKey(row: UserGlossaryRow): string {
  return row.term.slice(0, 96);
}

/**
 * Relaxed source match: every whitespace-delimited word in the variation must appear
 * somewhere in the normalized source (substring). More forgiving than one contiguous phrase.
 */
export function glossarySourceMatchesSourceText(normalizedLowerText: string, variation: string): boolean {
  const v = variation.toLowerCase().trim();
  if (v.length < 2) return false;
  const words = v.split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) {
    return normalizedLowerText.includes(v);
  }
  return words.every(w => normalizedLowerText.includes(w));
}

/** Lines for the OpenAI prompt: one hint per matched variation (strict + hint rows). */
export function buildUserGlossaryHintLines(entries: UserGlossaryRow[], phraseNormalized: string): string[] {
  const lower = phraseNormalized.toLowerCase();
  const hints: string[] = [];
  for (const entry of entries) {
    for (const v of parseGlossaryVariations(entry.term)) {
      if (glossarySourceMatchesSourceText(lower, v)) {
        hints.push(`"${v}" → "${entry.translation}"`);
      }
    }
  }
  return hints;
}

function buildReplacePattern(variation: string, global: boolean): RegExp | null {
  const v = variation.trim();
  if (v.length < 2) return null;
  const esc = escapeRegex(v);
  const flags = global ? "gi" : "i";
  // Word boundaries work for typical Latin/ASCII phrases; fallback for other scripts.
  const mostlyAsciiWords = /^[\s\w'.-]+$/u.test(v) && /[A-Za-z]/.test(v);
  if (mostlyAsciiWords) {
    return new RegExp(`\\b${esc}\\b`, flags);
  }
  return new RegExp(esc, flags);
}

function isStrictRow(e: UserGlossaryRow): boolean {
  return e.enforceMode !== "hint";
}

/**
 * Deterministic replacements on model output (manual priority, then longest phrases). Records which
 * variation strings were applied (at least one match each). Hint rows are skipped.
 */
export function applyUserGlossaryStrict(
  outputText: string,
  entries: UserGlossaryRow[],
  appliedOut: string[],
): string {
  type Pair = {
    variation: string;
    translation: string;
    rowPriority: number;
    autoTier: number;
    stableKey: string;
  };
  const pairs: Pair[] = [];
  for (const e of entries) {
    if (!isStrictRow(e)) continue;
    const autoTier = glossaryAutoPriorityTier(e);
    const stableKey = glossaryStableKey(e);
    for (const v of parseGlossaryVariations(e.term)) {
      pairs.push({
        variation: v,
        translation: e.translation,
        rowPriority: e.priority,
        autoTier,
        stableKey,
      });
    }
  }
  pairs.sort(
    (a, b) =>
      b.rowPriority - a.rowPriority ||
      b.autoTier - a.autoTier ||
      b.variation.length - a.variation.length ||
      a.stableKey.localeCompare(b.stableKey),
  );

  if (logger.isLevelEnabled("debug")) {
    const zeroPri = pairs.filter(p => p.rowPriority === 0).length;
    if (zeroPri > 0) {
      glossaryDbg.debug({
        event: "glossary_priority_auto_tier_sort",
        zeroPriorityPairCount: zeroPri,
        totalPairCount: pairs.length,
      });
    }
  }

  let result = outputText;
  const appliedSet = new Set<string>();

  for (const { variation, translation } of pairs) {
    const pattern = buildReplacePattern(variation, true);
    if (!pattern) continue;
    const before = result;
    result = result.replace(pattern, () => translation);
    if (result !== before) appliedSet.add(variation);
  }

  appliedOut.length = 0;
  for (const v of appliedSet) appliedOut.push(v);
  return result;
}

function translationPresentInOutput(haystack: string, needle: string): boolean {
  const n = needle.trim();
  if (n.length < 2) return true;
  // ASCII-only needles: case-insensitive check (handles EN leaks vs correct casing).
  if (/^[\x00-\x7F]+$/.test(n)) {
    return haystack.toLowerCase().includes(n.toLowerCase());
  }
  return normalizeForGlossaryMatch(haystack).includes(normalizeForGlossaryMatch(n));
}

function tokensMatchPreferredToken(wordCore: string, preferredCore: string): boolean {
  const w = wordCore.trim();
  const p = preferredCore.trim();
  if (w.length < 2 || p.length < 2) return false;
  if (/^[\x00-\x7F]+$/.test(w) && /^[\x00-\x7F]+$/.test(p)) {
    return w.toLowerCase() === p.toLowerCase();
  }
  return normalizeForGlossaryMatch(w) === normalizeForGlossaryMatch(p);
}

/** Longest-first contiguous word n-grams from a variation (words ≥2 chars) for inline replace attempts. */
function collectInlineReplaceCandidates(variation: string): string[] {
  const vRaw = variation.trim();
  if (vRaw.length < 2) return [];
  const words = vRaw.split(/\s+/).filter(p => p.length >= 2);
  const w = words.length > 0 ? words : vRaw.length >= 2 ? [vRaw] : [];
  if (w.length === 0) return [];
  const phrases: string[] = [];
  for (let len = w.length; len >= 1; len--) {
    for (let i = 0; i <= w.length - len; i++) {
      const phrase = w.slice(i, i + len).join(" ");
      if (phrase.length >= 2) phrases.push(phrase);
    }
  }
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const p of phrases) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
  }
  uniq.sort((a, b) => b.length - a.length);
  return uniq;
}

/**
 * First matching substring of `variation` in output → replace once with `translation` (non-global).
 * Uses replace-only matching (no regex .test) to avoid lastIndex issues.
 */
function tryInlineGlossaryReplace(outputText: string, variation: string, translation: string): string | null {
  for (const sub of collectInlineReplaceCandidates(variation)) {
    if (!inlineReplaceCandidateAllowed(sub)) continue;
    const pattern = buildReplacePattern(sub, false);
    if (!pattern) continue;
    const next = outputText.replace(pattern, () => translation);
    if (next !== outputText) return next;
  }
  return null;
}

function pushAppliedTranslation(appliedOut: string[], translation: string): void {
  const t = translation.trim();
  if (t.length < 2) return;
  if (!appliedOut.includes(t)) appliedOut.push(t);
}

/** English glossary source text suggests hemorrhoids / piles (MT often wrongly uses Arabic “bleeding” words). */
function sourceVariationsSuggestHemorrhoids(variations: string[]): boolean {
  const blob = variations.join(" ").toLowerCase();
  return /hemorrh|haemorrh|hemroid|haemorrhoid|\bpiles?\b/i.test(blob);
}

export function preferredLooksArabicScript(s: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
}

function hasLatinScript(s: string): boolean {
  return /\p{Script=Latin}/u.test(s);
}

function hasCyrillicScript(s: string): boolean {
  return /[\u0400-\u04FF]/.test(s);
}

function hasHanScript(s: string): boolean {
  return /\p{Script=Han}/u.test(s);
}

function hasHangulScript(s: string): boolean {
  return /\p{Script=Hangul}/u.test(s);
}

function hasThaiScript(s: string): boolean {
  return /[\u0E00-\u0E7F]/.test(s);
}

function hasDevanagariScript(s: string): boolean {
  return /[\u0900-\u097F]/.test(s);
}

/**
 * Skip glossary rows whose `translation` script does not fit the session **target** language
 * (e.g. Arabic-only saved gloss when translating English → Spanish).
 */
export function userGlossaryRowMatchesTargetLanguage(
  row: UserGlossaryRow,
  tgtLangBcp47: string,
): boolean {
  const trans = row.translation.trim();
  if (trans.length < 1) return false;
  const base = tgtLangBcp47.trim().toLowerCase().split("-")[0] ?? "";

  const ar = preferredLooksArabicScript(trans);
  const lat = hasLatinScript(trans);
  const cyr = hasCyrillicScript(trans);
  const han = hasHanScript(trans);
  const hang = hasHangulScript(trans);
  const th = hasThaiScript(trans);
  const dev = hasDevanagariScript(trans);

  if (base === "ar" || base === "fa" || base === "ur") {
    if (ar) return true;
    if (lat && !ar) return true;
    return false;
  }
  if (base === "hi") {
    return dev || ar || lat;
  }
  if (base === "th") {
    return th || lat;
  }
  if (base === "ru" || base === "uk" || base === "bg") {
    return cyr || lat;
  }
  if (base === "zh" || base === "ja") {
    return han || lat;
  }
  if (base === "ko") {
    return hang || lat;
  }
  // Latin-alphabet targets (es, en, fr, de, it, pt, nl, pl, id, vi, tr, …)
  if (ar && !lat && !cyr && !han && !hang && !dev && !th) return false;
  return true;
}

export function filterUserGlossaryForTarget(
  entries: UserGlossaryRow[],
  tgtLangBcp47: string,
): UserGlossaryRow[] {
  return entries.filter(e => userGlossaryRowMatchesTargetLanguage(e, tgtLangBcp47));
}

function graphemeLen(s: string): number {
  return [...s.normalize("NFC")].length;
}

function graphemeCpEqualFold(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 && b.length === 1 && /[A-Za-z]/.test(a) && /[A-Za-z]/.test(b)) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return false;
}

function longestCommonPrefixLengthGraphemes(a: string, b: string): number {
  const ca = [...a.normalize("NFC")];
  const cb = [...b.normalize("NFC")];
  let i = 0;
  const n = Math.min(ca.length, cb.length);
  while (i < n && graphemeCpEqualFold(ca[i]!, cb[i]!)) i++;
  return i;
}

function longestCommonSuffixLengthGraphemes(a: string, b: string): number {
  const ca = [...a.normalize("NFC")];
  const cb = [...b.normalize("NFC")];
  let i = 0;
  const n = Math.min(ca.length, cb.length);
  while (
    i < n &&
    graphemeCpEqualFold(ca[ca.length - 1 - i]!, cb[cb.length - 1 - i]!)
  )
    i++;
  return i;
}

/** Only mix scripts we can safely prefix-match (Latin, Arabic, Cyrillic, Han). */
function scriptsCompatibleForGlossaryFix(word: string, preferred: string): boolean {
  const wAr = preferredLooksArabicScript(word);
  const pAr = preferredLooksArabicScript(preferred);
  if (wAr || pAr) return wAr && pAr;

  const wLat = /\p{Script=Latin}/u.test(word);
  const pLat = /\p{Script=Latin}/u.test(preferred);
  const wCyr = /\p{Script=Cyrl}/u.test(word);
  const pCyr = /\p{Script=Cyrl}/u.test(preferred);
  const wHan = /\p{Script=Han}/u.test(word);
  const pHan = /\p{Script=Han}/u.test(preferred);

  if (wLat && pLat && !wCyr && !pCyr && !wHan && !pHan) return true;
  if (wCyr && pCyr) return true;
  if (wHan && pHan) return true;
  return false;
}

/**
 * When MT used wrong target word(s) that look like garbled forms of the user’s preferred **single**
 * token (shared long prefix or suffix: e.g. ES hemorragias ↔ hemorroides), replace **every** such
 * token in-place. Works across Latin, Arabic, Cyrillic, Han.
 */
function replaceAllTargetTokensByPreferredSimilarity(outputText: string, preferred: string): string {
  const T = preferred.trim();
  if (T.length < 2) return outputText;
  const Tcore = stripEdgePunct(T);
  if (Tcore.length < 2 || /\s/.test(Tcore)) return outputText;

  type Tok = { start: number; end: number; raw: string; core: string };
  const tokens: Tok[] = [];
  const re = /[\p{L}\p{M}][\p{L}\p{M}'’\-]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(outputText)) !== null) {
    const raw = m[0];
    const core = stripEdgePunct(raw);
    if (core.length < 2) continue;
    tokens.push({ start: m.index, end: m.index + raw.length, raw, core });
  }

  const lenT = graphemeLen(Tcore);
  const prefHan = /\p{Script=Han}/u.test(Tcore);
  const prefAr = preferredLooksArabicScript(Tcore);

  const hits: Tok[] = [];

  for (const t of tokens) {
    if (tokensMatchPreferredToken(t.core, Tcore)) continue;
    if (!scriptsCompatibleForGlossaryFix(t.core, Tcore)) continue;

    const lenW = graphemeLen(t.core);
    if (lenW < 3) continue;

    const lcp = longestCommonPrefixLengthGraphemes(t.core, Tcore);
    const lcs = longestCommonSuffixLengthGraphemes(t.core, Tcore);
    const bestEdge = Math.max(lcp, lcs);
    const denom = Math.max(lenW, lenT, 1);
    const ratio = bestEdge / denom;

    let minRatio = 0.5;
    let minEdge = 4;
    if (prefHan && /\p{Script=Han}/u.test(t.core)) {
      minRatio = 0.62;
      minEdge = 2;
    } else if (prefAr && preferredLooksArabicScript(t.core)) {
      minRatio = 0.4;
      minEdge = 3;
    }

    if (ratio < minRatio || bestEdge < minEdge) continue;
    if (lenW > lenT * 1.85 && ratio < 0.62) continue;
    if (lenT > lenW * 1.85 && ratio < 0.62) continue;

    hits.push(t);
  }

  if (hits.length === 0) return outputText;

  hits.sort((a, b) => b.start - a.start);
  let out = outputText;
  for (const t of hits) {
    out = out.slice(0, t.start) + T + out.slice(t.end);
  }
  return out;
}

/**
 * Replace common Arabic mistranslations of “hemorrhoids” (bleeding vocabulary) with the user’s
 * preferred term. English-only inline replace misses these because the model output is Arabic.
 */
function replaceArabicBleedingMisrenderForHemorrhoidGlossary(
  outputText: string,
  matchedEnglishVariations: string[],
  preferredArabic: string,
): string {
  if (!sourceVariationsSuggestHemorrhoids(matchedEnglishVariations)) return outputText;
  const pref = preferredArabic.trim();
  if (!preferredLooksArabicScript(pref)) return outputText;

  let out = outputText;
  // Longer substrings first (النزيفات before نزيفات).
  const wrongOrdered = [
    "النزيفات",
    "نزيفات",
    "النزيفين",
    "نزيفين",
    "بالنزيفات",
    "والنزيفات",
    "للنزيفات",
  ];
  for (const w of wrongOrdered) {
    if (!out.includes(w)) continue;
    out = out.split(w).join(pref);
  }
  return out;
}

/** Collapse “بواسير بواسير” when strict pass + append both landed the same preferred token. */
function dedupeAdjacentPreferredTranslation(out: string, pref: string): string {
  const p = pref.trim();
  if (p.length < 2) return out;
  const esc = escapeRegex(p);
  const re = new RegExp(`(${esc})(\\s+${esc})+`, "g");
  return out.replace(re, "$1");
}

const MAX_SOURCE_ENFORCED_TERMS = 2;

/** Common EN medical surface → ES clinic wording when target is Spanish (glossary source is English). */
const EN_TO_ES_INLINE_COGNATES: Record<string, string[]> = {
  colonoscopy: ["colonoscopia", "colonoscopía"],
};

/**
 * Source-aware enforcement (max {@link MAX_SOURCE_ENFORCED_TERMS} distinct translations per segment).
 * Hint rows are skipped. Strict rows only.
 * 1) Priority = manual `priority`, then longest source-matched variation.
 * 2) Inline replace (longest qualifying n-gram in output → translation, first hit only).
 * 3) For `es` target, replace Spanish cognates of matched English terms before append.
 * 4) Append only if still missing and not already semantically close to the preferred translation.
 */
export function ensureGlossaryTranslationsFromSource(
  outputText: string,
  phraseNormalized: string,
  entries: UserGlossaryRow[],
  appliedOut: string[],
  tgtLangBcp47?: string,
): string {
  const srcLower = phraseNormalized.toLowerCase();
  const tgtBase = tgtLangBcp47?.trim().toLowerCase().split("-")[0] ?? "";

  type Cand = {
    trans: string;
    rowPriority: number;
    matchLen: number;
    matchedVariations: string[];
  };

  const cands: Cand[] = [];
  for (const e of entries) {
    if (!isStrictRow(e)) continue;
    const trans = e.translation.trim();
    if (trans.length < 2) continue;

    const matchedVariations: string[] = [];
    let matchLen = 0;
    for (const v of parseGlossaryVariations(e.term)) {
      if (glossarySourceMatchesSourceText(srcLower, v)) {
        matchedVariations.push(v);
        matchLen = Math.max(matchLen, v.length);
      }
    }
    if (matchedVariations.length === 0) continue;
    if (translationPresentInOutput(outputText, trans)) continue;
    if (translationSemanticallyCloseInOutput(outputText, trans, "candidate_filter")) continue;

    cands.push({ trans, rowPriority: e.priority, matchLen, matchedVariations });
  }

  cands.sort((a, b) => b.rowPriority - a.rowPriority || b.matchLen - a.matchLen);

  const picked: Cand[] = [];
  const seenTrans = new Set<string>();
  for (const c of cands) {
    const k = c.trans.toLowerCase();
    if (seenTrans.has(k)) continue;
    seenTrans.add(k);
    picked.push(c);
    if (picked.length >= MAX_SOURCE_ENFORCED_TERMS) break;
  }

  let out = outputText;
  for (const row of picked) {
    const beforeArFix = out;
    out = replaceArabicBleedingMisrenderForHemorrhoidGlossary(out, row.matchedVariations, row.trans);
    if (out !== beforeArFix) pushAppliedTranslation(appliedOut, row.trans);

    const beforePrefix = out;
    out = replaceAllTargetTokensByPreferredSimilarity(out, row.trans);
    if (out !== beforePrefix) pushAppliedTranslation(appliedOut, row.trans);

    if (
      translationPresentInOutput(out, row.trans) ||
      translationSemanticallyCloseInOutput(out, row.trans, "pick_loop")
    ) {
      continue;
    }

    const vars = [...row.matchedVariations].sort((a, b) => b.length - a.length);
    let inlined = false;
    for (const v of vars) {
      const next = tryInlineGlossaryReplace(out, v, row.trans);
      if (next !== null) {
        out = next;
        pushAppliedTranslation(appliedOut, row.trans);
        inlined = true;
        break;
      }
    }
    if (inlined) continue;

    if (tgtBase === "es") {
      for (const v of vars) {
        const vKey = v.trim().toLowerCase();
        const cognates = EN_TO_ES_INLINE_COGNATES[vKey];
        if (!cognates) continue;
        for (const cogn of cognates) {
          const pat = buildReplacePattern(cogn, true);
          if (!pat) continue;
          const beforeCog = out;
          out = out.replace(pat, () => row.trans);
          if (out !== beforeCog) {
            pushAppliedTranslation(appliedOut, row.trans);
            inlined = true;
            break;
          }
        }
        if (inlined) break;
      }
    }
    if (inlined) continue;

    if (translationSemanticallyCloseInOutput(out, row.trans, "append_gate")) continue;

    // Spanish (and similar): never append glossary at sentence end — only in-place / cognate swaps.
    if (tgtBase === "es") continue;

    const tailBase = out.trimEnd();
    const spacer = tailBase.length > 0 ? " " : "";
    out = `${tailBase}${spacer}${row.trans}`.trim();
    pushAppliedTranslation(appliedOut, row.trans);
  }

  for (const row of picked) {
    out = dedupeAdjacentPreferredTranslation(out, row.trans);
  }

  return out;
}
