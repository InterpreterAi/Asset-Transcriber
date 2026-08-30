import {
  normalizeWorkspaceLanguageCode,
  workspaceLanguagesEqual,
} from "@/lib/workspace-languages";

import type { ChunkV2GlossaryEntry } from "./chunk-v2-glossary";
import { resolveRowTranslationDirection } from "./chunk-v2-glossary";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** NFC, strip ZW/NBSP, collapse whitespace — for exact-match surfaces only. */
function normalizeExactMatchSurface(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExactMatchSurfaceLower(s: string): string {
  return normalizeExactMatchSurface(s).toLowerCase();
}

function looksArabic(s: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s);
}

function arabicMatchCore(s: string): string {
  let t = s.normalize("NFC").replace(/\u0640/g, "");
  let guard = 0;
  while (guard++ < 6) {
    if (t.startsWith("ال") && t.length > 3) {
      t = t.slice(2);
      continue;
    }
    if (/^[وفبلك]/.test(t) && t.length > 3) {
      t = t.slice(1);
      continue;
    }
    break;
  }
  return t.replace(/ا{2,}/g, "ا");
}

function arabicMatchCoresForRelatedness(s: string): string[] {
  const base = arabicMatchCore(s);
  const cores = [base];
  if (base.startsWith("م") && base.length > 3) {
    cores.push(base.slice(1));
  }
  return cores;
}

function arabicCoresRelated(a: string, b: string): boolean {
  const coresA = arabicMatchCoresForRelatedness(a);
  const coresB = arabicMatchCoresForRelatedness(b);
  for (const ca of coresA) {
    for (const cb of coresB) {
      if (ca.length < 2 || cb.length < 2) continue;
      if (ca === cb) return true;
      if (ca.length >= 3 && cb.length >= 3 && (ca.includes(cb) || cb.includes(ca))) {
        return true;
      }
    }
  }
  return false;
}

const FILLER_WORD =
  /^(i|me|my|we|you|he|she|it|they|am|is|are|was|were|be|been|the|a|an|and|or|of|to|in|on|for|at|this|that|yes|no|ok|okay|please|today|yesterday|tomorrow|now|here|there|very|also|أنا|نحن|هو|هي|هم|هذا|هذه|ذلك|و|في|من|إلى|على|نعم|لا|اليوم|أمس|غدا|الآن|هنا|هناك|جدا|أيضا)$/iu;

function isFillerWord(w: string): boolean {
  return FILLER_WORD.test(w.trim());
}

function isMostlyNumeric(s: string): boolean {
  return /^[\d.,+\-#%/:]+$/.test(s.trim());
}

/**
 * Unicode-aware exact word/phrase boundary pattern.
 * Multiword phrases require contiguous words in order (flexible internal whitespace).
 */
export function buildExactPhrasePattern(phrase: string): RegExp {
  const trimmed = phrase.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return /(?!)/u;
  }
  const parts = words.map((w) => escapeRegex(w));
  const body = parts.length === 1 ? parts[0]! : parts.join("\\s+");
  return new RegExp(
    `(?<![\\p{L}\\p{M}])${body}(?![\\p{L}\\p{M}])`,
    "iu",
  );
}

/** True when the complete source phrase appears in Original with exact word/phrase boundaries. */
export function sourcePhraseInOriginal(original: string, source: string): boolean {
  return phraseInText(original, source);
}

function latinPhrasePattern(phrase: string): RegExp | null {
  const p = phrase.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 '\-]*$/.test(p)) return null;
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegex(p)}(?![A-Za-z0-9])`, "gi");
}

function phraseInText(haystack: string, phrase: string): boolean {
  const p = phrase.trim();
  if (p.length < 2 || !haystack.trim()) return false;
  const n = normalizeExactMatchSurface(haystack);
  if (buildExactPhrasePattern(p).test(n)) return true;
  const latin = latinPhrasePattern(p);
  return latin ? latin.test(n) : false;
}

function replacePhrase(text: string, from: string, to: string): string {
  const src = from.trim();
  if (src.length < 2) return text;
  const next = text.replace(buildExactPhrasePattern(src), to);
  if (next !== text) return next;
  const latin = latinPhrasePattern(src);
  return latin ? text.replace(latin, to) : text;
}

/**
 * True when Original (ignoring punctuation) is exactly the glossary source phrase.
 * Used to fully replace the translation with the preferred target.
 */
export function originalIsOnlySourcePhrase(original: string, source: string): boolean {
  const strip = (s: string) =>
    normalizeExactMatchSurfaceLower(s)
      .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const o = strip(original);
  const src = strip(source);
  return o.length >= 2 && o === src;
}

/** Original is the source phrase plus fillers ("I am tired", "نعم tired"). */
export function originalIsGlossaryFocused(original: string, source: string): boolean {
  if (originalIsOnlySourcePhrase(original, source)) return true;
  if (!sourcePhraseInOriginal(original, source)) return false;
  const leftover = normalizeExactMatchSurface(original)
    .replace(buildExactPhrasePattern(source), " ")
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!leftover) return true;
  return leftover.split(/\s+/).every((w) => isFillerWord(w) || isMostlyNumeric(w));
}

function entryMatchesDirection(
  entry: ChunkV2GlossaryEntry,
  direction: { sourceLanguage: string; targetLanguage: string },
): boolean {
  return (
    workspaceLanguagesEqual(entry.sourceLanguage, direction.sourceLanguage) &&
    workspaceLanguagesEqual(entry.targetLanguage, direction.targetLanguage)
  );
}

function entryBelongsToPair(
  entry: ChunkV2GlossaryEntry,
  langA: string,
  langB: string,
): boolean {
  const a = normalizeWorkspaceLanguageCode(langA);
  const b = normalizeWorkspaceLanguageCode(langB);
  return (
    (workspaceLanguagesEqual(entry.sourceLanguage, a) &&
      workspaceLanguagesEqual(entry.targetLanguage, b)) ||
    (workspaceLanguagesEqual(entry.sourceLanguage, b) &&
      workspaceLanguagesEqual(entry.targetLanguage, a))
  );
}

export function translationContainsPreferred(translation: string, preferred: string): boolean {
  const t = preferred.trim();
  if (t.length < 2) return true;
  if (buildExactPhrasePattern(t).test(translation)) return true;

  if (/^[\x00-\x7F]+$/.test(t)) {
    return normalizeExactMatchSurfaceLower(translation).includes(
      normalizeExactMatchSurfaceLower(t),
    );
  }

  if (translation.normalize("NFC").includes(t.normalize("NFC"))) return true;

  if (looksArabic(t)) {
    const prefCore = arabicMatchCore(t);
    if (prefCore.length < 2) return false;
    const re = /[\p{L}\p{M}][\p{L}\p{M}'’\-]*/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(translation)) !== null) {
      if (looksArabic(m[0]) && arabicMatchCore(m[0]) === prefCore) return true;
    }
  }

  return false;
}

function normalizeExactPreferredVariant(text: string, preferred: string): string {
  const prefExact = preferred.trim();
  const prefNorm = normalizeExactMatchSurfaceLower(prefExact);
  if (prefNorm.length < 2) return text;

  const pattern = buildExactPhrasePattern(prefExact);
  let out = text.replace(pattern, (match) => {
    if (normalizeExactMatchSurfaceLower(match) === prefNorm && match !== prefExact) {
      return prefExact;
    }
    return match;
  });

  if (looksArabic(prefExact)) {
    const prefCore = arabicMatchCore(prefExact);
    if (prefCore.length >= 2) {
      const re = /[\p{L}\p{M}][\p{L}\p{M}'’\-]*/gu;
      const hits: { start: number; end: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(out)) !== null) {
        const raw = m[0];
        if (raw === prefExact) continue;
        if (!looksArabic(raw)) continue;
        const rawCore = arabicMatchCore(raw);
        if (rawCore === prefCore || arabicCoresRelated(raw, prefExact)) {
          hits.push({ start: m.index, end: m.index + raw.length });
        }
      }
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i]!;
        out = out.slice(0, h.start) + prefExact + out.slice(h.end);
      }
    }
  }

  return out;
}

function dedupeAdjacentPreferred(out: string, pref: string): string {
  const p = pref.trim();
  if (p.length < 2) return out;
  const esc = escapeRegex(p);
  return out.replace(new RegExp(`(${esc})(\\s+${esc})+`, "gu"), "$1");
}

/** Replace the longest content token so the wrong Soniox word does not stay on screen. */
function replacePrimaryContentToken(translation: string, preferred: string): string {
  const pref = preferred.trim();
  if (!translation.trim()) return pref;
  const re = /[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’\-]*/gu;
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(translation)) !== null) {
    tokens.push(m[0]);
  }
  if (tokens.length === 0) return pref;
  if (tokens.length === 1) {
    return translation.replace(buildExactPhrasePattern(tokens[0]!), pref);
  }
  const candidates = tokens.filter(
    (t) =>
      !isFillerWord(t) &&
      !isMostlyNumeric(t) &&
      normalizeExactMatchSurfaceLower(t) !== normalizeExactMatchSurfaceLower(pref),
  );
  const pick = (candidates.length > 0 ? candidates : tokens)
    .slice()
    .sort((a, b) => b.length - a.length)[0];
  if (!pick) return pref;
  return translation.replace(buildExactPhrasePattern(pick), pref);
}

function forcePreferredIntoTranslation(
  translation: string,
  preferred: string,
  original: string,
  source: string,
): string {
  const pref = preferred.trim();
  if (pref.length < 2) return translation;

  if (originalIsOnlySourcePhrase(original, source)) {
    return pref;
  }

  if (translationContainsPreferred(translation, pref)) {
    return normalizeExactPreferredVariant(translation, pref);
  }

  const replaced = replacePrimaryContentToken(translation, pref);
  return dedupeAdjacentPreferred(replaced, pref);
}

export type ApplyGlossaryPostProcessOpts = {
  /** Finalized Original text for this row only. */
  originalText: string;
  /** Detected/spoken language of the Original row. */
  rowSourceLanguage: string;
  /** Active workspace pair side A. */
  langA: string;
  /** Active workspace pair side B. */
  langB: string;
};

/**
 * Soniox-native personal glossary enforcement.
 *
 * For each saved row (source → preferred):
 * - If Original contains source → force preferred in Translation.
 * - If Translation leaked source and this row is translating in that direction → replace.
 * Reverse-direction rows must not fire just because preferred is already in
 * Translation — that put English leaks like "tired" / "biopsy" back on screen.
 */
export function applyGlossaryPostProcess(
  text: string,
  entries: readonly ChunkV2GlossaryEntry[],
  opts: ApplyGlossaryPostProcessOpts,
): string {
  if (!entries.length) return text;

  const original = normalizeExactMatchSurface(opts.originalText);
  const translationIn = text;

  const direction = resolveRowTranslationDirection(
    opts.rowSourceLanguage,
    opts.langA,
    opts.langB,
  );

  const strictEntries = entries
    .filter((e) => entryBelongsToPair(e, opts.langA, opts.langB))
    .sort((a, b) => {
      const aDir = direction && entryMatchesDirection(a, direction) ? 1 : 0;
      const bDir = direction && entryMatchesDirection(b, direction) ? 1 : 0;
      return (
        bDir - aDir ||
        b.priority - a.priority ||
        b.source.length - a.source.length ||
        a.source.localeCompare(b.source)
      );
    });

  if (strictEntries.length === 0) return text;

  let result = translationIn;

  for (const entry of strictEntries) {
    const matchesRowDir = Boolean(direction && entryMatchesDirection(entry, direction));
    const spokeSource = original.length > 0 && sourcePhraseInOriginal(original, entry.source);
    // Only treat a translation hit as a leak for the row's direction.
    // A reverse row (تعبااان → tired) must not undo tired → تعبااان.
    const leakedSource = matchesRowDir && phraseInText(result, entry.source);
    if (!spokeSource && !leakedSource) continue;

    result = replacePhrase(result, entry.source, entry.target);
    result = normalizeExactPreferredVariant(result, entry.target);

    if (!translationContainsPreferred(result, entry.target)) {
      result = forcePreferredIntoTranslation(
        result,
        entry.target,
        original,
        entry.source,
      );
    } else {
      result = normalizeExactPreferredVariant(result, entry.target);
    }

    result = dedupeAdjacentPreferred(result, entry.target);
  }

  return result;
}

/** @internal test helper */
export function normalizeWorkspaceLangForGlossary(code: string): string {
  return normalizeWorkspaceLanguageCode(code);
}
