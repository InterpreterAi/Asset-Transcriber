import type { EngineState } from "../types/transcript";

export type TelemetryCounters = Record<string, number>;

export function snapshotEngineTelemetry(state: EngineState): TelemetryCounters {
  let committedChars = 0;
  for (const u of state.finalizedUtterances) {
    committedChars += u.committedText.length;
  }
  committedChars += state.activeUtterance?.committedText.length ?? 0;

  return {
    ...state.metrics,
    committedUtf16Chars: committedChars,
    globalCommitCursorUtf16: state.globalCommitCursorUtf16,
    paintTokens: state.paint.tokens.length,
    finalizedUtteranceRows: state.finalizedUtterances.length,
    endpointPending: state.endpointPending ? 1 : 0,
    last_hypothesis_lag_ms: typeof state.lastHypothesisLagMs === "number" ? state.lastHypothesisLagMs : -1,
  };
}
