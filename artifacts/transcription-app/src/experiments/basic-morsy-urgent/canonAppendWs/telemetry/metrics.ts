import type { CanonUtterance } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

import { syncCanonUtteranceRollup } from "../projection/utterance-rollup";

export type TelemetryCounters = Record<string, number>;

function rollupCommittedLength(u: CanonUtterance | null): number {
  if (!u) return 0;
  const s = syncCanonUtteranceRollup(u);
  return s.segments.reduce((acc, seg) => acc + seg.committedTokens.length, 0);
}

function countCommittedCanonTokens(state: EngineState): number {
  let n = 0;
  for (const u of state.finalizedUtterances) {
    n += u.committedTokens.length;
  }
  n += rollupCommittedLength(state.activeUtterance);
  return n;
}

export function snapshotEngineTelemetry(state: EngineState): TelemetryCounters {
  return {
    ...state.metrics,
    committedCanonTokens: countCommittedCanonTokens(state),
    finalizedUtteranceRows: state.finalizedUtterances.length,
    activeSegments: state.activeUtterance?.segments.length ?? 0,
    last_hypothesis_lag_ms: typeof state.lastHypothesisLagMs === "number" ? state.lastHypothesisLagMs : -1,
  };
}
