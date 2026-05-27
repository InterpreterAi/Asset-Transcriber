import {
  HYPOTHESIS_LAG_REJECT_SILENCE_FINALIZE_MS,
  LIVE_TAIL_MIN_MEAN_CONFIDENCE_SILENCE_FINALIZE,
} from "./segmentation-constants";

import type { TranscriptRow } from "../types/canon-token";

function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function meanConfidenceLiveTail(tail: TranscriptRow): number | null {
  const vals = tail.liveTokens.map(t => {
    const c = t.confidence;
    return typeof c === "number" && Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 1;
  });
  return mean(vals);
}

/**
 * Fallback silence finalization waits for stable hypothesis confidence.
 * Endpoint / strong speaker LANG transitions bypass this externally.
 */
export function silenceLiveHypothesisConfidenceOk(tail: TranscriptRow): boolean {
  if (tail.liveTokens.length === 0) return true;
  const m = meanConfidenceLiveTail(tail);
  if (m === null) return true;
  return m >= LIVE_TAIL_MIN_MEAN_CONFIDENCE_SILENCE_FINALIZE;
}

/** `total_audio_proc_ms - final_audio_proc_ms`: large deltas suggest laggy tail — soft veto for silence path only. */
export function hypothesisLagAllowsSilenceFinal(
  hypothesisLagMs: number | null | undefined,
): boolean {
  if (hypothesisLagMs === null || hypothesisLagMs === undefined || !Number.isFinite(hypothesisLagMs)) {
    return true;
  }
  return hypothesisLagMs <= HYPOTHESIS_LAG_REJECT_SILENCE_FINALIZE_MS;
}
