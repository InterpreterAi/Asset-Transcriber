import { normalizeEndpointText } from "../reducer/endpoint";
import { committedTextUpTo } from "../reducer/stable-prefix";
import type { EngineState } from "../types/transcript";

export type TranscriptProjection = {
  committedVisibleText: string;
  hypothesisText: string;
  liveCombined: string;
};

export function projectTranscriptView(state: EngineState): TranscriptProjection {
  const ix = Math.min(state.committedVisibleIndex, state.committedInternal.length);
  let committedCore = committedTextUpTo(state.committedInternal, ix);
  if (state.endpointState.active && committedCore.length > 0) {
    committedCore = normalizeEndpointText(committedCore);
  }
  const hypo = state.hypothesisText;
  return {
    committedVisibleText: committedCore,
    hypothesisText: hypo,
    liveCombined: `${committedCore}${hypo}`,
  };
}
