/**
 * Personal glossary: source matching for prompt hints + strict post-processing on translation output.
 * Does not modify transcription (STT).
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
  return haystack.includes(n);
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

const MAX_SOURCE_ENFORCED_TERMS = 2;

/**
 * Source-aware enforcement (max {@link MAX_SOURCE_ENFORCED_TERMS} distinct translations per segment).
 * Hint rows are skipped. Strict rows only.
 * 1) Priority = manual `priority`, then longest source-matched variation.
 * 2) Inline replace (longest qualifying n-gram in output → translation, first hit only).
 * 3) Append only if still missing and not already semantically close to the preferred translation.
 */
export function ensureGlossaryTranslationsFromSource(
  outputText: string,
  phraseNormalized: string,
  entries: UserGlossaryRow[],
  appliedOut: string[],
): string {
  const srcLower = phraseNormalized.toLowerCase();

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

    if (translationSemanticallyCloseInOutput(out, row.trans, "append_gate")) continue;

    const base = out.trimEnd();
    const spacer = base.length > 0 ? " " : "";
    out = `${base}${spacer}${row.trans}`.trim();
    pushAppliedTranslation(appliedOut, row.trans);
  }

  return out;
}
