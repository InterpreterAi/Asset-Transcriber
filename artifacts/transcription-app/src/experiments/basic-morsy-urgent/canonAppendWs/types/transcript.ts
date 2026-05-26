import type { SpeakerVote } from "./speakers";
import type { Token } from "./tokens";

export type CommittedToken = {
  id: string;
  joinedText: string;
  speakerId?: string;
  /** Entity staging queue entry timestamp (mono clock). */
  stagedSinceMs?: number;
};

/**
 * Canonical engine state snapshot (single source of truth for this experiment).
 * DOM is ALWAYS derived from projections of this shape — never the reverse.
 */
export type EngineState = {
  /** Finalized transcript lines closed by Soniox endpoint flush (immutable history). */
  completedSegments: string[];
  committedInternal: CommittedToken[];
  committedVisibleIndex: number;
  pendingStableTokens: CommittedToken[];
  hypothesisTokens: Token[];
  hypothesisText: string;
  activeSegmentId: string | null;
  activeSpeakerId: string | null;
  speakerWindow: SpeakerVote[];
  lastFrameSeq: number;
  endpointState: {
    active: boolean;
    lastEndpointMs: number;
  };
  metrics: {
    retractCount: number;
    entityFlickerCount: number;
    speakerFlipCount: number;
    staleTailCount: number;
  };
};

export function createInitialEngineState(): EngineState {
  return {
    completedSegments: [],
    committedInternal: [],
    committedVisibleIndex: 0,
    pendingStableTokens: [],
    hypothesisTokens: [],
    hypothesisText: "",
    activeSegmentId: null,
    activeSpeakerId: null,
    speakerWindow: [],
    lastFrameSeq: 0,
    endpointState: { active: false, lastEndpointMs: 0 },
    metrics: {
      retractCount: 0,
      entityFlickerCount: 0,
      speakerFlipCount: 0,
      staleTailCount: 0,
    },
  };
}
