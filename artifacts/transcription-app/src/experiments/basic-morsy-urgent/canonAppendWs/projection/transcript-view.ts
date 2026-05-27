import { committedTextUpTo } from "../reducer/stable-prefix";
import type { EngineState } from "../types/transcript";

export type TranscriptProjection = {
  committedVisibleText: string;
  hypothesisText: string;
  liveCombined: string;
};

export function projectTranscriptView(state: EngineState): TranscriptProjection {
  const ix = Math.min(state.committedVisibleIndex, state.committedInternal.length);
  /** Committed region is immutable — never rewritten for endpoint “cleanup”. */
  const committedCore = committedTextUpTo(state.committedInternal, ix);
  const hypo = state.hypothesisText;
  return {
    committedVisibleText: committedCore,
    hypothesisText: hypo,
    liveCombined: `${committedCore}${hypo}`,
  };
}
