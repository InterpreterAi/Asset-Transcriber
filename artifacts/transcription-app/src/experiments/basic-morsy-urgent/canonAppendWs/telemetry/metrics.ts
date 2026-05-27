import type { EngineState } from "../types/transcript";

export type TelemetryCounters = Record<string, number>;

function countCommittedCanonTokens(state: EngineState): number {
  let n = 0;
  for (const u of state.finalizedUtterances) {
    n += u.committedTokens.length;
  }
  n += state.activeUtterance?.committedTokens.length ?? 0;
  return n;
}

export function snapshotEngineTelemetry(state: EngineState): TelemetryCounters {
  return {
    ...state.metrics,
    committedCanonTokens: countCommittedCanonTokens(state),
    paintTokens: state.paint.tokens.length,
    finalizedUtteranceRows: state.finalizedUtterances.length,
    endpointPending: state.endpointPending ? 1 : 0,
    last_hypothesis_lag_ms: typeof state.lastHypothesisLagMs === "number" ? state.lastHypothesisLagMs : -1,
  };
}
