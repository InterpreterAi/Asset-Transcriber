/**
 * Chunk V2 shadow validation — compare append-only live translation vs full-stable reference.
 * Measurement only; never replaces visible text.
 */

import { pendingEndsWithSentencePunctuation } from "@/hooks/morsy-urgent-chunk-translation-v2";

const LATIN_WORD_RE = /\b[A-Za-z]{2,}\b/g;

export function countLatinWordsInTranslation(text: string): number {
  return (text.match(LATIN_WORD_RE) ?? []).length;
}

function normalizeShadowCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Repeated adjacent bigrams — proxy for duplicated medical concepts in Arabic output. */
export function duplicatePhraseScore(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let repeats = 0;
  for (const c of bigrams.values()) {
    if (c > 1) repeats += c - 1;
  }
  return repeats;
}

export type ChunkV2ShadowDiffResult = {
  significant: boolean;
  reasons: string[];
};

export function evaluateChunkV2ShadowDiff(args: {
  liveAppendedTranslation: string;
  fullStableTranslation: string;
}): ChunkV2ShadowDiffResult {
  const reasons: string[] = [];
  const live = normalizeShadowCompare(args.liveAppendedTranslation);
  const full = normalizeShadowCompare(args.fullStableTranslation);
  if (!live.length || !full.length) {
    return { significant: false, reasons: [] };
  }

  const liveLatin = countLatinWordsInTranslation(live);
  const fullLatin = countLatinWordsInTranslation(full);
  if (liveLatin > fullLatin && liveLatin > 0) {
    reasons.push("english_leakage");
  }

  const liveDup = duplicatePhraseScore(live);
  const fullDup = duplicatePhraseScore(full);
  if (liveDup >= 2 && liveDup > fullDup) {
    reasons.push("duplicated_concepts");
  }

  const lenRatio = Math.min(live.length, full.length) / Math.max(live.length, full.length);
  if (live.length > 24 && full.length > 24 && lenRatio < 0.72) {
    reasons.push("length_divergence");
  }

  if (
    live.length > 40 &&
    full.length > 40 &&
    lenRatio < 0.88 &&
    !full.includes(live.slice(0, Math.min(24, live.length)))
  ) {
    reasons.push("terminology_drift");
  }

  return { significant: reasons.length > 0, reasons };
}

/** Fire shadow compare at sentence-ending stable boundaries (measurement only). */
export function shouldRunChunkV2ShadowValidation(args: {
  stableSource: string;
  lastShadowStableChecked: string;
  minStableChars?: number;
}): boolean {
  const stable = args.stableSource.trim();
  const minChars = args.minStableChars ?? 24;
  if (stable.length < minChars) return false;
  if (stable === args.lastShadowStableChecked.trim()) return false;
  return pendingEndsWithSentencePunctuation(stable);
}
