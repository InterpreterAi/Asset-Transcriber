import type { EngineState } from "../types/transcript";

export function selectMetrics(state: EngineState) {
  return state.metrics;
}

export function selectEndpoint(state: EngineState) {
  return state.endpointState;
}
