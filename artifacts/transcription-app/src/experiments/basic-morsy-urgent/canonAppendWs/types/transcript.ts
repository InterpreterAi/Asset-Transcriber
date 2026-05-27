import type { CanonUtterance } from "./canon-utterance";
import type { SpeakerVote } from "./speakers";

import type { SegmentHoldState } from "../policies/segment-hold";
import { createInitialSegmentHold } from "../policies/segment-hold";

/**
 * CanonAppendWs canonical engine snapshot: finalized conversational utterances + one active evolving utterance.
 * Low-level `TranscriptRow` segments nest under {@link CanonUtterance}; UI projects utterance-level rows.
 */
export type EngineState = {
  finalizedUtterances: CanonUtterance[];
  activeUtterance: CanonUtterance | null;
  nextUtteranceSeq: number;
  /** Monotonic segment row IDs inside utterances (`seg-*`). */
  nextSegmentRowSeq: number;

  speakerWindow: SpeakerVote[];
  activeSpeakerId: string | null;
  activeLanguageId: string | null;
  lastFrameSeq: number;
  lastTokenActivityWallMs: number;
  /** Last Soniox `endpoint` wall time — secondary cue for fallback silence segmentation. */
  lastSonioxEndpointWallMs: number;

  segmentHold: SegmentHoldState;
  endpointState: {
    active: boolean;
    lastEndpointMs: number;
  };

  /** SONIOX audio processor horizons from last websocket message (milliseconds). */
  lastFinalAudioProcMs: number | null;
  lastTotalAudioProcMs: number | null;
  /** Cached `total - final` for silence-path stabilization heuristics. */
  lastHypothesisLagMs: number | null;

  metrics: {
    retractCount: number;
    speakerFlipCount: number;
    staleTailCount: number;
    segmentCloseCount: number;
    utteranceFinalizedCount: number;
  };
};

export function createInitialEngineState(): EngineState {
  return {
    finalizedUtterances: [],
    activeUtterance: null,
    nextUtteranceSeq: 0,
    nextSegmentRowSeq: 0,

    speakerWindow: [],
    activeSpeakerId: null,
    activeLanguageId: null,
    lastFrameSeq: 0,
    lastTokenActivityWallMs: 0,
    lastSonioxEndpointWallMs: 0,

    segmentHold: createInitialSegmentHold(),
    endpointState: { active: false, lastEndpointMs: 0 },

    lastFinalAudioProcMs: null,
    lastTotalAudioProcMs: null,
    lastHypothesisLagMs: null,

    metrics: {
      retractCount: 0,
      speakerFlipCount: 0,
      staleTailCount: 0,
      segmentCloseCount: 0,
      utteranceFinalizedCount: 0,
    },
  };
}
