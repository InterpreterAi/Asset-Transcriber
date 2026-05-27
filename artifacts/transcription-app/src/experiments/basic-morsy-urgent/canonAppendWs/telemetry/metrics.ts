import type { EngineState } from "../types/transcript";

export type TelemetryCounters = {
  hypothesisRetracts: number;
  entityFlickers: number;
  speakerFlips: number;
  staleTailLifetimeSamples: number;
  blankDumpEvents: number;
  stablePrefixGrowth: number;
  volatileRewriteRate: number;
  segmentCloses: number;
};

function countCommittedCanonTokens(state: EngineState): number {
  let n = 0;
  for (const r of state.rows) n += r.committedTokens.length;
  return n;
}

export function snapshotEngineTelemetry(state: EngineState): TelemetryCounters {
  return {
    hypothesisRetracts: state.metrics.retractCount,
    entityFlickers: 0,
    speakerFlips: state.metrics.speakerFlipCount,
    staleTailLifetimeSamples: state.metrics.staleTailCount,
    blankDumpEvents: 0,
    stablePrefixGrowth: countCommittedCanonTokens(state),
    volatileRewriteRate: 0,
    segmentCloses: state.metrics.segmentCloseCount,
  };
}
