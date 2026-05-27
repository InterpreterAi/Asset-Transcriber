import type { CanonUtterance } from "./canon-utterance";
import type { CanonToken } from "./canon-token";

import type { SegmentHoldState } from "../policies/segment-hold";
import { createInitialSegmentHold } from "../policies/segment-hold";

/** Raw Soniox non-final staging — applied to active row mutableTail only. */
export type PaintBuffer = {
  tokens: CanonToken[];
  lastMutationWallMs: number;
  lastFrameSeq: number;
};

/**
 * Engine snapshot: immutable-prefix streaming rows + consumed-text ledger.
 */
export type EngineState = {
  paint: PaintBuffer;

  finalizedUtterances: CanonUtterance[];
  activeUtterance: CanonUtterance | null;
  nextUtteranceSeq: number;

  /** Finalized committedText blocks — prevents replay into future rows. */
  consumedCommittedTexts: string[];
  /** Global monotonic commit cursor (sum of finalized + active committed lengths). */
  globalCommitCursorUtf16: number;

  segmentHold: SegmentHoldState;

  endpointPending: boolean;
  endpointPendingAtMs: number;
  endpointPendingAudioProcMs: number | null;

  lastFrameSeq: number;
  lastTokenActivityWallMs: number;
  lastSonioxEndpointWallMs: number;

  lastFinalAudioProcMs: number | null;
  lastTotalAudioProcMs: number | null;
  lastHypothesisLagMs: number | null;

  metrics: {
    retractCount: number;
    speakerFlipCount: number;
    paintReplaceCount: number;
    deferredFinalCount: number;
    rejectedCrossSpeakerPaintCount: number;
    utteranceFinalizedCount: number;
    stabilizationFreezeCount: number;
  };
};

export function createInitialEngineState(): EngineState {
  return {
    paint: { tokens: [], lastMutationWallMs: 0, lastFrameSeq: 0 },

    finalizedUtterances: [],
    activeUtterance: null,
    nextUtteranceSeq: 0,

    consumedCommittedTexts: [],
    globalCommitCursorUtf16: 0,

    segmentHold: createInitialSegmentHold(),

    endpointPending: false,
    endpointPendingAtMs: 0,
    endpointPendingAudioProcMs: null,

    lastFrameSeq: 0,
    lastTokenActivityWallMs: 0,
    lastSonioxEndpointWallMs: 0,

    lastFinalAudioProcMs: null,
    lastTotalAudioProcMs: null,
    lastHypothesisLagMs: null,

    metrics: {
      retractCount: 0,
      speakerFlipCount: 0,
      paintReplaceCount: 0,
      deferredFinalCount: 0,
      rejectedCrossSpeakerPaintCount: 0,
      utteranceFinalizedCount: 0,
      stabilizationFreezeCount: 0,
    },
  };
}
