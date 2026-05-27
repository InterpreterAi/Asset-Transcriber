import type { EngineState } from "../types/transcript";

export function selectMetrics(state: EngineState) {
  return state.metrics;
}

export function selectEndpointPending(_state: EngineState) {
  return { pending: false, atMs: 0, audioProcMs: null as number | null };
}

/** @deprecated use selectEndpointPending */
export function selectEndpoint(state: EngineState) {
  return selectEndpointPending(state);
}
