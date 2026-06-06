/**
 * Chunk V3 investigation instrumentation — console only, no behavior changes.
 * May contain PHI; disable via localStorage interpreterai_morsy_chunk_v3_diag=0
 */

export type ChunkV3VisibleSnap = {
  visibleText: string;
  stableText: string;
  volatileTail: string;
};

let chunkV3EventSeq = 0;

export function nextChunkV3EventId(): string {
  chunkV3EventSeq += 1;
  return `chunk_v3_${chunkV3EventSeq}`;
}

export function chunkV3DiagEnabled(): boolean {
  try {
    if (typeof globalThis.localStorage === "undefined") return true;
    const v = globalThis.localStorage.getItem("interpreterai_morsy_chunk_v3_diag");
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

function snippet(text: string, max = 240): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function logChunkV3VisibleChange(args: {
  rowId: string;
  snap: ChunkV3VisibleSnap;
  fedVisiblePrefix: string;
  reason: "poll_delta" | "prefix_reset" | "chunk_extract" | "force_flush";
}): void {
  if (!chunkV3DiagEnabled()) return;
  console.info("[chunk_v3_visible]", {
    eventId: nextChunkV3EventId(),
    rowId: args.rowId,
    reason: args.reason,
    visibleText: args.snap.visibleText,
    stableText: args.snap.stableText,
    volatileTail: args.snap.volatileTail,
    fedVisiblePrefix: args.fedVisiblePrefix,
    visibleIncludesVolatileTail: args.snap.visibleText.length > args.snap.stableText.length,
  });
}

export function logChunkV3ChunkExtract(args: {
  rowId: string;
  eventId: string;
  snap: ChunkV3VisibleSnap;
  extractReason: "sentence_boundary" | "force_flush_800ms" | "force_flush_row" | "stop";
  rawChunk: string;
  fedVisiblePrefixBefore: string;
}): void {
  if (!chunkV3DiagEnabled()) return;
  console.info("[chunk_v3_chunk_extract]", {
    eventId: args.eventId,
    rowId: args.rowId,
    extractReason: args.extractReason,
    rawChunk: args.rawChunk,
    visibleText: args.snap.visibleText,
    stableText: args.snap.stableText,
    volatileTail: args.snap.volatileTail,
    fedVisiblePrefixBefore: args.fedVisiblePrefixBefore,
  });
}

export function logChunkV3TranslateResult(args: {
  rowId: string;
  eventId: string;
  rawChunk: string;
  sourceLang: string;
  targetLang: string;
  translationReturned: string;
  displayedBefore: string;
  displayedAfter: string;
  requestLatencyMs: number;
}): void {
  if (!chunkV3DiagEnabled()) return;
  console.info("[chunk_v3_translate_result]", {
    eventId: args.eventId,
    rowId: args.rowId,
    rawChunk: args.rawChunk,
    sourceLang: args.sourceLang,
    targetLang: args.targetLang,
    translationReturned: args.translationReturned,
    displayedBefore: args.displayedBefore,
    displayedAfter: args.displayedAfter,
    requestLatencyMs: args.requestLatencyMs,
    appendedNotReplaced:
      args.displayedBefore.trim().length > 0 &&
      args.displayedAfter.trim().length > args.displayedBefore.trim().length &&
      args.displayedAfter.startsWith(args.displayedBefore.trimEnd()),
  });
}

export function logChunkV3DisplayPaint(args: {
  rowId: string;
  eventId: string;
  displayedChunk: string;
  rtlBidiPaint: boolean;
}): void {
  if (!chunkV3DiagEnabled()) return;
  console.info("[chunk_v3_display]", {
    eventId: args.eventId,
    rowId: args.rowId,
    displayedChunk: args.displayedChunk,
    displayedSnippet: snippet(args.displayedChunk),
    rtlBidiPaint: args.rtlBidiPaint,
  });
}
