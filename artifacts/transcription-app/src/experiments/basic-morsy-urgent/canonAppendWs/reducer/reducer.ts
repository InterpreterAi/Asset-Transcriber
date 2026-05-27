import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";

import {
  appendFinalToActive,
  freezeActiveUtterance,
  openActiveUtterance,
  rowBreaksOnFinalToken,
} from "./row-lifecycle";
import {
  canonTokensFromFrame,
  inferTailSpeakerLang,
  nonFinalsForRow,
} from "./soniox-frame-split";

export type ReduceContext = {
  ledger: AppendOnlyCanonLedger;
  wallMs: number;
};

/**
 * Soniox real-time contract (Basic · Morsy Urgent only):
 * 1. Append each new final token once — never rewrite prior finals
 * 2. Replace non-finals every frame (current response only)
 * 3. New row on speaker/language final boundary or endpoint
 *
 * @see https://soniox.com/docs/stt/rt/real-time-transcription
 */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  void ctx.wallMs;

  const finProc =
    typeof frame.final_audio_proc_ms === "number" && Number.isFinite(frame.final_audio_proc_ms)
      ? frame.final_audio_proc_ms
      : null;
  const totProc =
    typeof frame.total_audio_proc_ms === "number" && Number.isFinite(frame.total_audio_proc_ms)
      ? frame.total_audio_proc_ms
      : null;
  let lagComputed: number | null = null;
  if (finProc !== null && totProc !== null) lagComputed = Math.max(0, totProc - finProc);

  let next: EngineState = {
    ...state,
    lastFrameSeq: frame.seq,
    lastFinalAudioProcMs: finProc !== null ? finProc : state.lastFinalAudioProcMs,
    lastTotalAudioProcMs: totProc !== null ? totProc : state.lastTotalAudioProcMs,
    lastHypothesisLagMs: lagComputed !== null ? lagComputed : state.lastHypothesisLagMs,
  };

  const canon = canonTokensFromFrame(frame.tokens);
  const frameFinals = canon.filter(t => t.is_final);
  const frameNonFinals = canon.filter(t => !t.is_final);

  for (const ct of frameFinals) {
    if (next.seenFinalTokenIds.includes(ct.token_id)) continue;
    next = { ...next, seenFinalTokenIds: [...next.seenFinalTokenIds, ct.token_id] };
    ctx.ledger.appendFinalCanon(ct);

    if (next.activeUtterance && rowBreaksOnFinalToken(next.activeUtterance, ct)) {
      next = freezeActiveUtterance(next);
      next = {
        ...next,
        metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
      };
    }

    if (!next.activeUtterance) {
      next = openActiveUtterance(next, ct.speaker, ct.language);
    }

    next = appendFinalToActive(next, ct);
  }

  const tail = inferTailSpeakerLang(canon.length ? canon : frameNonFinals);

  if (!next.activeUtterance && frameNonFinals.length > 0) {
    next = openActiveUtterance(next, tail.speaker, tail.language);
  }

  if (next.activeUtterance) {
    const row = next.activeUtterance;
    const rowSpeaker = row.speaker ?? tail.speaker;
    next = {
      ...next,
      activeUtterance: {
        ...row,
        speaker: row.speaker ?? tail.speaker,
        language: row.language ?? tail.language,
        nonFinalTokens: nonFinalsForRow(frameNonFinals, rowSpeaker),
      },
    };
  }

  if (frame.endpoint) {
    next = freezeActiveUtterance(next);
  }

  return next;
}
