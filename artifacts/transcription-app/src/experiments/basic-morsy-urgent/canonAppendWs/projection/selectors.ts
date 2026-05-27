import type { EngineState } from "../types/transcript";

export function selectMetrics(state: EngineState) {
  return state.metrics;
}

export function selectEndpointPending(state: EngineState) {
  return {
    pending: state.endpointPending,
    atMs: state.endpointPendingAtMs,
    audioProcMs: state.endpointPendingAudioProcMs,
  };
}

/** @deprecated use selectEndpointPending */
export function selectEndpoint(state: EngineState) {
  return selectEndpointPending(state);
}
