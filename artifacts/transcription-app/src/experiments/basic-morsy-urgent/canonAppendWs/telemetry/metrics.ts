import { utteranceCommittedText } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

export type TelemetryCounters = Record<string, number>;

export function snapshotEngineTelemetry(state: EngineState): TelemetryCounters {
  let committedChars = 0;
  for (const u of state.finalizedUtterances) {
    committedChars += utteranceCommittedText(u).length;
  }
  if (state.activeUtterance) {
    committedChars += utteranceCommittedText(state.activeUtterance).length;
  }

  return {
    ...state.metrics,
    committedUtf16Chars: committedChars,
    finalizedUtteranceRows: state.finalizedUtterances.length,
    last_hypothesis_lag_ms: typeof state.lastHypothesisLagMs === "number" ? state.lastHypothesisLagMs : -1,
  };
}
