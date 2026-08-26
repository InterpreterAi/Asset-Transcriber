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

/** Strip Arabic clitics / tatweel / elongated ا for "already present" checks only. */
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

/** Cores for relatedness: base core plus optional participle prefix م. */
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
  const src = source.trim();
  if (src.length < 2) return false;
  const orig = normalizeExactMatchSurface(original);
  if (orig.length < 1) return false;
  return buildExactPhrasePattern(src).test(orig);
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

function entryMatchesDirection(
  entry: ChunkV2GlossaryEntry,
  direction: { sourceLanguage: string; targetLanguage: string },
): boolean {
  return (
    workspaceLanguagesEqual(entry.sourceLanguage, direction.sourceLanguage) &&
    workspaceLanguagesEqual(entry.targetLanguage, direction.targetLanguage)
  );
}

/** Entry is for the active workspace pair (either direction). */
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

/** Preferred already present (exact phrase, or Arabic core-equivalent token). */
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

  // Arabic: same stem after clitic/elongation strip → rewrite to exact preferred spelling.
  // Also rewrite related stems where one core contains the other (min 3 chars),
  // e.g. متعب (تعب) ↔ تعبااان (تعبان) when source was proven in Original.
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

  // Preferred still missing after leak/normalize passes: force it once into the segment.
  const tail = translation.trimEnd();
  const forced = `${tail}${tail.length > 0 ? " " : ""}${pref}`.trim();
  return dedupeAdjacentPreferred(forced, pref);
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
 * Chunk-v2 personal glossary enforcement (any workspace language pair, either direction).
 *
 * Gates (all required):
 * - Entry belongs to the active workspace pair (either direction)
 * - enforceMode === strict
 * - Exact source phrase in this row's Original (finalized or live committed+live)
 *
 * Direction (LID) is a preference for ranking only — Soniox LID mismatches must not
 * drop a proven source→preferred force when the entry's source is in Original.
 *
 * Force behavior:
 * - Replace exact source leaks with preferred
 * - Normalize exact/clitic-equivalent preferred spelling already present
 * - If Original is only the source phrase → translation becomes preferred
 * - Otherwise if preferred still missing → force preferred into the translation once
 *
 * hint rows: Soniox translation_terms only (no client force).
 */
export function applyGlossaryPostProcess(
  text: string,
  entries: readonly ChunkV2GlossaryEntry[],
  opts: ApplyGlossaryPostProcessOpts,
): string {
  if (!entries.length) return text;

  const original = normalizeExactMatchSurface(opts.originalText);
  if (original.length < 1) return text;

  const direction = resolveRowTranslationDirection(
    opts.rowSourceLanguage,
    opts.langA,
    opts.langB,
  );

  const strictEntries = entries
    .filter((e) => e.enforceMode === "strict")
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

  let result = text;

  for (const entry of strictEntries) {
    if (!sourcePhraseInOriginal(original, entry.source)) continue;

    const leakPattern = buildExactPhrasePattern(entry.source);
    result = result.replace(leakPattern, entry.target);

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
