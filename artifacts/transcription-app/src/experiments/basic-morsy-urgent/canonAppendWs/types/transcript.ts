import type { SpeakerVote } from "./speakers";
import type { TranscriptRow } from "./canon-token";

/**
 * Canonical engine snapshot for canonAppendWs: multi-row transcript with token identity + live reconciliation.
 */
export type EngineState = {
  rows: TranscriptRow[];
  nextRowSeq: number;
  /** Soniox majority tail — informational; segmentation uses token-level speaker/lang. */
  speakerWindow: SpeakerVote[];
  activeSpeakerId: string | null;
  activeLanguageId: string | null;
  lastFrameSeq: number;
  /** Last frame time we saw substantive tokens or endpoint (wall clock). */
  lastTokenActivityWallMs: number;
  endpointState: {
    active: boolean;
    lastEndpointMs: number;
  };
  metrics: {
    retractCount: number;
    speakerFlipCount: number;
    staleTailCount: number;
    segmentCloseCount: number;
  };
};

export function createInitialEngineState(): EngineState {
  return {
    rows: [],
    nextRowSeq: 0,
    speakerWindow: [],
    activeSpeakerId: null,
    activeLanguageId: null,
    lastFrameSeq: 0,
    lastTokenActivityWallMs: 0,
    endpointState: { active: false, lastEndpointMs: 0 },
    metrics: {
      retractCount: 0,
      speakerFlipCount: 0,
      staleTailCount: 0,
      segmentCloseCount: 0,
    },
  };
}
