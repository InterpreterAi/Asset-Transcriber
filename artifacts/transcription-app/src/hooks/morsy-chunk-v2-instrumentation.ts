/**
 * Chunk V2 investigation instrumentation — console logs only, no behavior changes.
 * Enabled when Chunk V2 experiment is on (always logs during investigation pass).
 */

export const CHUNK_V2_CONTAMINATION_MARKERS = [
  "您的",
  "لا يوجد نص لترجمته",
  "عذرا لا يوجد",
  "Sorry",
  "No text to translate",
  "no text to translate",
] as const;

let chunkV2RequestSeq = 0;

export function nextChunkV2RequestId(): string {
  chunkV2RequestSeq += 1;
  return `chunk_v2_${chunkV2RequestSeq}`;
}

function snippet(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function logChunkV2VisualRegression(args: {
  rowId: string;
  source: string;
  previousCommittedTranslation: string;
  nextCommittedTranslation: string;
  nextLiveTranslation: string;
  previousRenderedTranslation: string;
  nextRenderedTranslation: string;
}): void {
  const prevCommittedLen = args.previousCommittedTranslation.length;
  const nextCommittedLen = args.nextCommittedTranslation.length;
  const prevRenderedLen = args.previousRenderedTranslation.length;
  const nextRenderedLen = args.nextRenderedTranslation.length;

  const committedShrunk = nextCommittedLen < prevCommittedLen;
  const renderedShrunk = nextRenderedLen < prevRenderedLen;
  const committedPrefixBroken =
    prevCommittedLen > 0 &&
    nextCommittedLen > 0 &&
    !args.nextCommittedTranslation.startsWith(args.previousCommittedTranslation);
  const renderedPrefixBroken =
    prevCommittedLen > 0 &&
    nextRenderedLen > 0 &&
    !args.nextRenderedTranslation.startsWith(args.previousCommittedTranslation);

  if (!committedShrunk && !renderedShrunk && !committedPrefixBroken && !renderedPrefixBroken) return;

  console.warn("[chunk_v2_visual_regression]", {
    rowId: args.rowId,
    source: args.source,
    previousCommittedLength: prevCommittedLen,
    nextCommittedLength: nextCommittedLen,
    previousRenderedLength: prevRenderedLen,
    nextRenderedLength: nextRenderedLen,
    committedShrunk,
    renderedShrunk,
    committedPrefixBroken,
    renderedPrefixBroken,
    previousCommittedText: snippet(args.previousCommittedTranslation),
    nextCommittedText: snippet(args.nextCommittedTranslation),
    previousRenderedText: snippet(args.previousRenderedTranslation),
    nextRenderedText: snippet(args.nextRenderedTranslation),
    nextLiveText: snippet(args.nextLiveTranslation),
  });
}

export function logChunkV2DomPaint(args: {
  rowId: string;
  method: "setRowTranslation" | "setRowTranslationPrefixLive" | "paintTranslation" | "paintTranslationPrefixLive";
  previousRendered: string;
  nextLocked: string;
  nextLive: string;
  nextComposed: string;
  caller?: string;
}): void {
  const prevLen = args.previousRendered.length;
  const nextLen = args.nextComposed.length;
  if (nextLen >= prevLen) return;
  console.warn("[chunk_v2_visual_regression]", {
    rowId: args.rowId,
    source: `dom:${args.method}`,
    caller: args.caller,
    previousRenderedLength: prevLen,
    nextRenderedLength: nextLen,
    previousText: snippet(args.previousRendered),
    nextLockedText: snippet(args.nextLocked),
    nextLiveText: snippet(args.nextLive),
    nextComposedText: snippet(args.nextComposed),
  });
}

export type ChunkV2WatchdogEvent =
  | "watchdog_armed"
  | "watchdog_cancelled"
  | "watchdog_fired"
  | "watchdog_deferred"
  | "watchdog_skipped_no_pending"
  | "watchdog_translation_started"
  | "watchdog_translation_completed"
  | "watchdog_translation_rejected";

export function logChunkV2Watchdog(
  event: ChunkV2WatchdogEvent,
  args: {
    rowId: string;
    stableLen?: number;
    visibleLen?: number;
    committedSourceLen?: number;
    pendingLen?: number;
    lastCommitAgeMs?: number;
    chunkInFlight?: boolean;
    reason?: string;
  },
): void {
  console.info(`[${event}]`, args);
}

export function logChunkV2Request(args: {
  requestId: string;
  rowId: string;
  trigger: string;
  mode: "stable" | "live" | "endpoint";
  sourceText: string;
  stableText: string;
  committedSource: string;
  pendingDelta: string;
}): void {
  const pendingLength = args.pendingDelta.length;
  const sourceLength = args.sourceText.length;
  console.info("[chunk_v2_request]", {
    requestId: args.requestId,
    rowId: args.rowId,
    trigger: args.trigger,
    mode: args.mode,
    stableLength: args.stableText.length,
    committedLength: args.committedSource.length,
    pendingLength,
    sourceLength,
    sourceWords: args.sourceText.trim().split(/\s+/).filter(Boolean).length,
    tinySource: sourceLength > 0 && sourceLength <= 3,
    tinyPending: pendingLength > 0 && pendingLength <= 3,
    stableText: snippet(args.stableText, 160),
    committedSource: snippet(args.committedSource, 160),
    pendingDelta: snippet(args.pendingDelta, 160),
    pendingText: snippet(args.pendingDelta, 160),
    sourceText: snippet(args.sourceText, 160),
    sourceTextRaw: args.sourceText,
  });
}

export function logChunkV2RawModelResponse(args: {
  requestId: string;
  rowId: string;
  trigger: string;
  sourceText: string;
  rawResponse: string;
  mode: "stable" | "live" | "endpoint";
}): void {
  const markers = CHUNK_V2_CONTAMINATION_MARKERS.filter(
    (m) => args.rawResponse.includes(m) || args.sourceText.includes(m),
  );
  console.info("[chunk_v2_raw_model_response]", {
    requestId: args.requestId,
    rowId: args.rowId,
    trigger: args.trigger,
    mode: args.mode,
    sourceChars: args.sourceText.length,
    sourceWords: args.sourceText.trim().split(/\s+/).filter(Boolean).length,
    responseChars: args.rawResponse.length,
    contaminationMarkers: markers,
    sourceSnippet: snippet(args.sourceText),
    rawResponseSnippet: snippet(args.rawResponse),
    rawResponse: args.rawResponse,
  });
}

export function logChunkV2ExecuteGate(args: {
  rowId: string;
  mode: string;
  forceWatchdog?: boolean;
  rejected: boolean;
  reason: string;
  chunkInFlight?: boolean;
  locked?: boolean;
}): void {
  if (!args.rejected) return;
  console.info("[chunk_v2_execute_rejected]", args);
}
