import { joinCanonText } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

import { paintMeanConfidence } from "./final-stabilization";
import {
  ENDPOINT_MATURITY_MAX_WAIT_MS,
  HYPOTHESIS_LAG_COLLAPSED_MS,
  LIVE_TAIL_MIN_MEAN_CONFIDENCE_SILENCE_FINALIZE,
  STABILIZATION_QUIET_MS,
} from "./segmentation-constants";

function utteranceEndsWithSentenceBoundary(joined: string): boolean {
  const t = joined.replace(/\s+$/u, "");
  if (!t.length) return false;
  const last = t[t.length - 1]!;
  return (
    last === "." ||
    last === "?" ||
    last === "!" ||
    last === "。" ||
    last === "？" ||
    last === "！" ||
    last === "…"
  );
}

export function hypothesisLagCollapsed(state: EngineState): boolean {
  const lag = state.lastHypothesisLagMs;
  if (lag === null || !Number.isFinite(lag)) return true;
  return lag <= HYPOTHESIS_LAG_COLLAPSED_MS;
}

export function paintQuietSince(state: EngineState, wallMs: number): boolean {
  const last = state.paint.lastMutationWallMs;
  if (last <= 0) return true;
  return wallMs - last >= STABILIZATION_QUIET_MS;
}

export function paintConfidenceAcceptable(state: EngineState): boolean {
  const m = paintMeanConfidence(state.paint);
  if (m === null) return true;
  return m >= LIVE_TAIL_MIN_MEAN_CONFIDENCE_SILENCE_FINALIZE;
}

/** Endpoint-pending delayed freeze — `<end>` is maturity signal, not immediate structural latch. */
export function endpointMaturityFreezeReady(state: EngineState, wallMs: number): boolean {
  if (!state.endpointPending) return false;
  if (!paintQuietSince(state, wallMs)) return false;
  if (!hypothesisLagCollapsed(state)) return false;
  if (!paintConfidenceAcceptable(state)) return false;

  const opened = state.activeUtterance?.utteranceOpenedWallMs ?? state.endpointPendingAtMs;
  const waited = wallMs - state.endpointPendingAtMs;
  if (waited >= ENDPOINT_MATURITY_MAX_WAIT_MS) return true;

  const committed = joinCanonText(state.activeUtterance?.committedTokens ?? []);
  const paint = joinCanonText(state.paint.tokens);
  const joined = committed + paint;
  if (utteranceEndsWithSentenceBoundary(joined)) return true;

  return waited >= STABILIZATION_QUIET_MS * 2 && paint.length === 0;
}

/** Silence fallback uses same reconcile-freeze path with punctuation gate. */
export function silenceFallbackFreezeReady(
  state: EngineState,
  wallMs: number,
  secondaryGate: boolean,
): boolean {
  if (state.endpointPending) return false;
  if (!secondaryGate) return false;
  if (!paintQuietSince(state, wallMs)) return false;
  if (!hypothesisLagCollapsed(state)) return false;
  if (!paintConfidenceAcceptable(state)) return false;

  const committed = joinCanonText(state.activeUtterance?.committedTokens ?? []);
  const paint = joinCanonText(state.paint.tokens);
  return utteranceEndsWithSentenceBoundary(committed + paint) || state.segmentHold.deferredSwitchPending;
}
