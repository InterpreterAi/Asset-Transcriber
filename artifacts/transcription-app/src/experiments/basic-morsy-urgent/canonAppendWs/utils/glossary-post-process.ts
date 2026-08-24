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

function entryMatchesDirection(
  entry: ChunkV2GlossaryEntry,
  direction: { sourceLanguage: string; targetLanguage: string },
): boolean {
  return (
    workspaceLanguagesEqual(entry.sourceLanguage, direction.sourceLanguage) &&
    workspaceLanguagesEqual(entry.targetLanguage, direction.targetLanguage)
  );
}

/**
 * Replace spans that normalize identically to the preferred target but differ in exact form
 * (Unicode normalization / ASCII case only — no semantic guessing).
 */
function normalizeExactPreferredVariant(text: string, preferred: string): string {
  const prefExact = preferred.trim();
  const prefNorm = normalizeExactMatchSurfaceLower(prefExact);
  if (prefNorm.length < 2) return text;

  const pattern = buildExactPhrasePattern(prefExact);
  return text.replace(pattern, (match) => {
    if (normalizeExactMatchSurfaceLower(match) === prefNorm && match !== prefExact) {
      return prefExact;
    }
    return match;
  });
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
 * Conservative chunk-v2 personal glossary cleanup on finalized Soniox translation text.
 * hint rows: no client enforcement (Soniox translation_terms only).
 * strict rows: replace exact source leaks or normalize exact preferred variants only when
 * the source phrase is proven in the finalized Original and direction matches.
 */
export function applyGlossaryPostProcess(
  text: string,
  entries: readonly ChunkV2GlossaryEntry[],
  opts: ApplyGlossaryPostProcessOpts,
): string {
  if (!text.trim() || !entries.length) return text;

  const original = normalizeExactMatchSurface(opts.originalText);
  if (original.length < 1) return text;

  const direction = resolveRowTranslationDirection(
    opts.rowSourceLanguage,
    opts.langA,
    opts.langB,
  );
  if (!direction) return text;

  const strictEntries = entries
    .filter((e) => e.enforceMode === "strict")
    .filter((e) => entryMatchesDirection(e, direction))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.source.length - a.source.length ||
        a.source.localeCompare(b.source),
    );

  let result = text;

  for (const entry of strictEntries) {
    if (!sourcePhraseInOriginal(original, entry.source)) continue;

    const leakPattern = buildExactPhrasePattern(entry.source);
    result = result.replace(leakPattern, entry.target);

    result = normalizeExactPreferredVariant(result, entry.target);
  }

  return result;
}

/** @internal test helper */
export function normalizeWorkspaceLangForGlossary(code: string): string {
  return normalizeWorkspaceLanguageCode(code);
}
