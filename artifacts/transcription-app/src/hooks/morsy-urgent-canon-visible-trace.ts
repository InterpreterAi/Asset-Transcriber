/**
 * Behavioral telemetry for **Basic · Morsy Urgent** + **`morsy-intercall-isolated-experiment`** canon-append path:
 * compares authoritative **`lockedCommittedFinalOriginal`** vs monotone visible promotion + translation/live buffers.
 *
 * Enable (reload after toggling):
 *   `localStorage.setItem("interpreterai_morsy_canon_visible_trace", "1")`
 *
 * Disable:
 *   `localStorage.removeItem("interpreterai_morsy_canon_visible_trace")`
 *
 * **PHI warning:** payloads may clip live transcript tails — development / lab only.
 */

import type { MorsyCanonPromotionKind } from "@/hooks/morsy-isolated-semantic-visible";

let traceSeq = 0;

/** @returns true when console tracing is active for this subsystem. */
export function morsyUrgentCanonVisibleTraceEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("interpreterai_morsy_canon_visible_trace") === "1";
  } catch {
    return false;
  }
}

function clipPublicTranscript(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}\u2026`;
}

export type MorsyUrgentCanonVisibleTracePayload = {
  segmentId: string;
  wallMs: number;
  /** UTF-16 length of authoritative finals canon after this WS frame. */
  lockedUtf16Len: number;
  /** UTF-16 growth since last trace line (same segment; reset on new bubble / clear). */
  lockedGrowthUtf16SinceLastEmit: number;
  /** Monotone visible-commit boundary after paint. */
  visibleBoundaryUtf16: number;
  /** `locked − visibleBoundary` UTF-16 (staged-but-not-visibly-committed tail on originals column). */
  stagingGapLockedUtf16: number;
  newFinalPiecesInMsgCount: number;
  newFinalPiecesUtf16InMsg: number;
  nfRawUtf16Len: number;
  nfPaintVisibleUtf16Len: number;
  liveBufferUtf16Len: number;
  translationLastConfirmedUsesFullCanon: boolean;
  /** `liveBuffer` is `locked∥nf` on this path (usually ahead of visible committed). */
  liveBufferFusesAuthorityPlusNf: boolean;
  promoted: boolean;
  promoteReason: MorsyCanonPromotionKind;
  idleNeedMsSuggested: number;
  msQuietSinceCanonGrowth: number;
  msBacklogLag: number | null;
  tentativeTailUtf16BeforeStep: number;
  steppedBoundaryUtf16BeforeMonotoneClamp: number;
  boundaryBeforePaintUtf16: number;
  semanticStabilizeLiveDispatched: boolean;
  sawSonioxEndpoint: boolean;
  /** Clipped tail of staged canon (post-boundary) for entity debugging. */
  stagedTailPeek: string;
};

export function emitMorsyUrgentCanonVisibleTrace(payload: MorsyUrgentCanonVisibleTracePayload): void {
  if (!morsyUrgentCanonVisibleTraceEnabled()) return;
  traceSeq += 1;
  console.info("[morsy_canon_visible_trace]", { seq: traceSeq, ...payload });
}

export function canonVisibleTraceStagingTailPeek(locked: string, visibleBoundaryUtf16: number): string {
  const t = locked.slice(visibleBoundaryUtf16);
  return clipPublicTranscript(t, 72);
}
