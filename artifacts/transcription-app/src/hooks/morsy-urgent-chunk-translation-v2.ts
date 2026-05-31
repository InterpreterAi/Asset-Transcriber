/**
 * Basic · Morsy Urgent — chunk append translation (client-side state helpers).
 */

export const CHUNK_V2_WATCHDOG_FLUSH_MS = 1000;
export const CHUNK_V2_ACCUM_WORD_LIMIT = 10;
export const CHUNK_V2_ACCUM_TIMEOUT_MS = 1500;

export type ChunkV2TranslateTrigger =
  | "punctuation"
  | "word_limit"
  | "timeout"
  | "endpoint"
  | "watchdog"
  | "live_preview"
  | "first_chunk"
  | "debounce";

export type ChunkV2TelemetryEvent = {
  trigger: ChunkV2TranslateTrigger;
  sourceChars: number;
  sourceWords: number;
  translatedChars: number;
  requestLatencyMs: number;
  queueWaitMs: number;
  stallDetected?: boolean;
  rowId?: string;
};

export type MorsyChunkTranslationRowState = {
  committedSource: string;
  committedTranslation: string;
  liveSource: string;
  liveTranslation: string;
};

const CLAUSE_PUNCT_RE = /[.,;:?!\u061F\u060C\u061B]/;

export function emptyMorsyChunkTranslationRowState(): MorsyChunkTranslationRowState {
  return {
    committedSource: "",
    committedTranslation: "",
    liveSource: "",
    liveTranslation: "",
  };
}

/** New Soniox finals since last committed stable source (append-only). */
export function extractNewStableChunk(stableText: string, committedSource: string): string {
  const stable = stableText;
  const committed = committedSource;
  if (!stable.length) return "";
  if (!committed.length) return stable;
  if (stable.startsWith(committed)) {
    return stable.slice(committed.length);
  }
  return stable;
}

/** Non-final NF tail after committed Soniox finals. */
export function extractLiveTail(visibleText: string, stableText: string): string {
  const visible = visibleText;
  const stable = stableText;
  if (!visible.length) return "";
  if (!stable.length) return visible;
  if (visible.startsWith(stable)) {
    return visible.slice(stable.length);
  }
  return visible;
}

/** Append a translated chunk without re-translating prior committed text. */
export function appendTranslationChunk(committed: string, chunk: string): string {
  const left = committed.trimEnd();
  const right = chunk.trim();
  if (!right) return left;
  if (!left) return right;
  const needsSpace = !/^[\s,.!?;:)]/.test(chunk) && !/[\s([\-–—]$/.test(left);
  return needsSpace ? `${left} ${right}` : `${left}${chunk.startsWith(" ") ? chunk.trimStart() : chunk}`;
}

export function countChunkWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** Commit boundary through the last clause punctuation in pending (inclusive). */
export function chunkThroughLastPunctuation(pending: string): string | null {
  let lastIdx = -1;
  for (let i = 0; i < pending.length; i++) {
    if (CLAUSE_PUNCT_RE.test(pending[i]!)) lastIdx = i;
  }
  if (lastIdx < 0) return null;
  const slice = pending.slice(0, lastIdx + 1);
  return slice.trim().length >= 1 ? slice : null;
}

/** First {@link wordLimit} words from pending (preserves leading whitespace). */
export function chunkThroughWordLimit(pending: string, wordLimit: number): string | null {
  if (countChunkWords(pending) < wordLimit) return null;
  const leadWs = pending.length - pending.trimStart().length;
  const trimmed = pending.slice(leadWs);
  const re = new RegExp(`^(\\S+(?:\\s+\\S+){${wordLimit - 1}}\\s*)`);
  const m = trimmed.match(re);
  if (!m?.[1]) return null;
  return pending.slice(0, leadWs + m[1].length);
}

export type SelectStableChunkResult = {
  chunk: string;
  trigger: ChunkV2TranslateTrigger;
};

/** Pending stable delta to translate on debounce / first grow (append-only, never whole segment). */
export function selectPendingStableDelta(args: {
  pending: string;
  committedSource: string;
  firstChunk?: boolean;
  debounceFlush?: boolean;
}): SelectStableChunkResult | null {
  const pending = args.pending;
  if (!pending.trim()) return null;
  if (args.firstChunk && !args.committedSource.trim() && pending.trim().length >= 3) {
    return { chunk: pending, trigger: "first_chunk" };
  }
  if (args.debounceFlush && pending.trim().length >= 3) {
    return { chunk: pending, trigger: "debounce" };
  }
  return null;
}

export function selectAccumulatedStableChunk(args: {
  pending: string;
  chunkStartTs: number;
  nowMs: number;
  minChars?: number;
  forceAll?: boolean;
  forceTrigger?: ChunkV2TranslateTrigger;
}): SelectStableChunkResult | null {
  const pending = args.pending;
  const minChars = args.minChars ?? 3;
  if (!pending.trim()) return null;

  if (args.forceAll && args.forceTrigger) {
    return { chunk: pending, trigger: args.forceTrigger };
  }

  const throughPunct = chunkThroughLastPunctuation(pending);
  if (throughPunct && throughPunct.trim().length >= minChars) {
    return { chunk: throughPunct, trigger: "punctuation" };
  }

  const throughWords = chunkThroughWordLimit(pending, CHUNK_V2_ACCUM_WORD_LIMIT);
  if (throughWords && throughWords.trim().length >= minChars) {
    return { chunk: throughWords, trigger: "word_limit" };
  }

  if (args.nowMs - args.chunkStartTs >= CHUNK_V2_ACCUM_TIMEOUT_MS && pending.trim().length >= minChars) {
    return { chunk: pending, trigger: "timeout" };
  }

  return null;
}

/** Advance committedSource by translated chunk; returns new committed source prefix. */
export function advanceCommittedSource(
  committedSource: string,
  stableText: string,
  translatedChunkSource: string,
): string {
  const next = committedSource + translatedChunkSource;
  if (stableText.startsWith(next)) return next;
  if (stableText.startsWith(committedSource)) {
    return stableText.slice(0, committedSource.length + translatedChunkSource.length);
  }
  return next;
}

export function validateChunkV2Invariants(args: {
  rowId: string;
  committedSource: string;
  committedTranslation: string;
  stableText: string;
  prevCommittedSource: string;
  prevCommittedTranslation: string;
}): void {
  const violations: string[] = [];
  if (args.committedSource.length > args.stableText.length) {
    violations.push("committedSource.length > stableText.length");
  }
  if (
    args.committedSource.length > 0 &&
    args.stableText.length > 0 &&
    !args.stableText.startsWith(args.committedSource)
  ) {
    violations.push("committedSource is not a prefix of stableText");
  }
  if (args.committedTranslation.length < args.prevCommittedTranslation.length) {
    violations.push("committedTranslation decreased");
  }
  if (args.committedSource.length < args.prevCommittedSource.length) {
    violations.push("committedSource shrank");
  }
  if (violations.length > 0) {
    console.error("[chunk_v2_invariant_violation]", {
      rowId: args.rowId,
      violations,
      committedSourceLen: args.committedSource.length,
      stableTextLen: args.stableText.length,
      prevCommittedSourceLen: args.prevCommittedSource.length,
      prevCommittedTranslationLen: args.prevCommittedTranslation.length,
      committedTranslationLen: args.committedTranslation.length,
    });
  }
}

export function logChunkV2Telemetry(event: ChunkV2TelemetryEvent): void {
  console.info("[chunk_v2_translation]", event);
}
