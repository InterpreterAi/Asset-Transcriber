import type { EngineState } from "../types/transcript";

import { mergedActiveDisplayText } from "../projection/utterance-rollup";
import {
  endpointMaturityFreezeReady,
  silenceFallbackFreezeReady,
} from "../policies/stabilization-freeze";

export function utteranceEndsWithSentenceBoundary(joined: string): boolean {
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

export function silenceCloseSecondaryGate(state: EngineState, wallMs: number): boolean {
  const joined = mergedActiveDisplayText(state);
  if (utteranceEndsWithSentenceBoundary(joined)) return true;
  if (state.segmentHold.deferredSwitchPending) return true;

  const open = state.activeUtterance?.utteranceOpenedWallMs ?? 0;
  const ep = state.lastSonioxEndpointWallMs;
  if (ep > 0 && ep >= open && wallMs - ep <= 12_000) return true;

  return false;
}

export { endpointMaturityFreezeReady, silenceFallbackFreezeReady };
