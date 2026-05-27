import type { CanonToken } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

/** Replace paint hypothesis only — no structural side effects. */
export function replacePaintBuffer(
  state: EngineState,
  tokens: CanonToken[],
  wallMs: number,
  frameSeq: number,
): EngineState {
  const prevLen = state.paint.tokens.length;
  return {
    ...state,
    paint: {
      tokens,
      lastMutationWallMs: wallMs,
      lastFrameSeq: frameSeq,
    },
    metrics: {
      ...state.metrics,
      paintReplaceCount: state.metrics.paintReplaceCount + (tokens.length !== prevLen || frameSeq !== state.paint.lastFrameSeq ? 1 : 0),
    },
  };
}

export function clearPaintBuffer(state: EngineState): EngineState {
  return {
    ...state,
    paint: { tokens: [], lastMutationWallMs: 0, lastFrameSeq: state.paint.lastFrameSeq },
  };
}
