import type { EngineState } from "../types/transcript";
import type { Token } from "../types/tokens";

/**
 * Signals-only policy: Soniox diarization is a cue, NOT transcript-row ownership.
 * Speaker changes commit only after hysteresis or endpoint confirmation.
 */
export const SPEAKER_PIVOT_STABLE_MS = 400;
/** User spec: commit after ~2 agreeing finals holding the pivot candidate speaker. */
export const SPEAKER_PIVOT_ALIGNED_FINAL_THRESHOLD = 2;

function finalsAlignedWithSpeaker(finals: Token[], speakerId: string): number {
  let n = 0;
  for (const t of finals) {
    if (!t.isFinal) continue;
    const sid = t.speakerId?.trim();
    if (!sid || sid === speakerId) n++;
  }
  return n;
}

function clearPivot(s: EngineState): EngineState {
  return {
    ...s,
    pivotCandidateSpeakerId: null,
    pivotCandidateSinceMs: 0,
    pivotAgreeFinalCount: 0,
  };
}

export function advanceSpeakerPivot(
  state: EngineState,
  majoritySpeaker: string | null,
  finalsThisFrame: Token[],
  endpoint: boolean,
  wallMs: number,
): EngineState {
  const maj = majoritySpeaker?.trim()?.length ? majoritySpeaker.trim() : null;

  /** First anchored speaker — no hysteresis delay. */
  if (maj && state.activeSpeakerId === null) {
    return clearPivot({
      ...state,
      activeSpeakerId: maj,
    });
  }

  if (!maj || maj === state.activeSpeakerId) {
    return clearPivot(state);
  }

  let candidateId = state.pivotCandidateSpeakerId;
  let sinceMs = state.pivotCandidateSinceMs;
  let agree = state.pivotAgreeFinalCount;

  if (candidateId !== maj) {
    candidateId = maj;
    sinceMs = wallMs;
    agree = finalsAlignedWithSpeaker(finalsThisFrame, maj);
  } else {
    agree += finalsAlignedWithSpeaker(finalsThisFrame, maj);
  }

  const dwellStable = wallMs - sinceMs >= SPEAKER_PIVOT_STABLE_MS;
  const finalsStable = agree >= SPEAKER_PIVOT_ALIGNED_FINAL_THRESHOLD;

  const shouldCommitSpeaker = endpoint || dwellStable || finalsStable;

  if (!shouldCommitSpeaker) {
    return {
      ...state,
      pivotCandidateSpeakerId: candidateId,
      pivotCandidateSinceMs: sinceMs,
      pivotAgreeFinalCount: agree,
    };
  }

  const prev = state.activeSpeakerId;
  const nextActive = maj;
  const flipped = prev !== null && prev !== nextActive;
  return clearPivot({
    ...state,
    activeSpeakerId: nextActive,
    metrics: flipped
      ? { ...state.metrics, speakerFlipCount: state.metrics.speakerFlipCount + 1 }
      : state.metrics,
  });
}
