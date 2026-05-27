import type { CanonUtterance } from "../types/canon-utterance";
import { joinCanonText } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

import { syntheticTailFromUtterance } from "../projection/utterance-rollup";
import {
  hypothesisLagAllowsSilenceFinal,
  silenceLiveHypothesisConfidenceOk,
} from "./utterance-confidence";

/** Sentence-ish boundary before silence-driven utterance finalization (secondary alongside duration). */
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

/** Fallback silence segmentation — Soniox endpoint latch bypasses these gates upstream. */
export function silenceCloseSecondaryGate(
  state: EngineState,
  active: CanonUtterance,
  wallMs: number,
): boolean {
  const synthetic = syntheticTailFromUtterance(active);
  const joined = joinCanonText([...synthetic.committedTokens, ...synthetic.liveTokens]);
  if (utteranceEndsWithSentenceBoundary(joined)) return true;

  if (state.segmentHold.deferredSwitchPending) return true;

  const open = synthetic.openedWallMs ?? active.utteranceOpenedWallMs ?? 0;
  const ep = state.lastSonioxEndpointWallMs;
  if (ep > 0 && ep >= open && wallMs - ep <= 12_000) return true;

  return false;
}

/** Confidence + hypothesis lag — applies to silence fallback only (endpoint-driven freeze is unconditional). */
export function silenceConfidenceAndLagOk(state: EngineState, active: CanonUtterance): boolean {
  const synthetic = syntheticTailFromUtterance(active);
  const confOk = silenceLiveHypothesisConfidenceOk(synthetic);
  const lagOk = hypothesisLagAllowsSilenceFinal(state.lastHypothesisLagMs);
  return confOk && lagOk;
}
