import type { EngineState } from "../types/transcript";

export type TelemetryCounters = {
  hypothesisRetracts: number;
  entityFlickers: number;
  speakerFlips: number;
  staleTailLifetimeSamples: number;
  blankDumpEvents: number;
  stablePrefixGrowth: number;
  volatileRewriteRate: number;
};

export function snapshotEngineTelemetry(state: EngineState): TelemetryCounters {
  return {
    hypothesisRetracts: state.metrics.retractCount,
    entityFlickers: state.metrics.entityFlickerCount,
    speakerFlips: state.metrics.speakerFlipCount,
    staleTailLifetimeSamples: state.metrics.staleTailCount,
    blankDumpEvents: 0,
    stablePrefixGrowth: state.committedInternal.length,
    volatileRewriteRate: 0,
  };
}
