import type { EngineState } from "../types/transcript";
import { createInitialEngineState } from "../types/transcript";

export function openSegment(state: EngineState, segmentId: string): EngineState {
  return {
    ...state,
    activeSegmentId: segmentId,
    hypothesisTokens: [],
    hypothesisText: "",
    pendingStableTokens: [],
  };
}

/** Hard boundary: endpoint or forced speaker pivot finalize. */
export function finalizeSegmentBaseline(state: EngineState, nextSegmentId: string | null): EngineState {
  return {
    ...createInitialEngineState(),
    completedSegments: [...state.completedSegments],
    lastFrameSeq: state.lastFrameSeq,
    activeSegmentId: nextSegmentId,
    activeSpeakerId: state.activeSpeakerId,
    speakerWindow: [...state.speakerWindow],
    metrics: { ...state.metrics },
  };
}
