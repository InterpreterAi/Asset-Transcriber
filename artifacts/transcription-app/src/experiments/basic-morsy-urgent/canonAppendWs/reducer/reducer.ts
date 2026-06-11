import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";

import { shouldCloseRowAfterEndpoint } from "../policies/endpoint-row-close";
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

function tryEndpointRowClose(state: EngineState, wallMs: number): EngineState {
  const au = state.activeUtterance;
  if (!au) {
    return state.endpointPending
      ? { ...state, endpointPending: false, endpointPendingAtMs: 0 }
      : state;
  }
  if (
    shouldCloseRowAfterEndpoint({
      row: au,
      endpointPending: state.endpointPending,
      wallMs,
      lastTokenActivityWallMs: state.lastTokenActivityWallMs,
    })
  ) {
    return {
      ...freezeActiveUtterance(state),
      endpointPending: false,
      endpointPendingAtMs: 0,
    };
  }
  return state;
}

/**
 * Soniox real-time contract + Intercall row timing:
 * - Append finals once; replace non-finals each frame
 * - New row on speaker/language final boundary
 * - Endpoint marks pause; close row only after tail finalizes + quiet + sentence end
 */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  const wallMs = ctx.wallMs;

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
        endpointPending: false,
        endpointPendingAtMs: 0,
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

  if (frame.tokens.length > 0) {
    next = { ...next, lastTokenActivityWallMs: wallMs };
  }

  if (frame.endpoint) {
    next = {
      ...next,
      endpointPending: true,
      endpointPendingAtMs: wallMs,
    };
  }

  next = tryEndpointRowClose(next, wallMs);

  return next;
}

/** Called between websocket frames (PCM ticks) to close row after endpoint quiet. */
export function maybeCloseRowAfterEndpointQuiet(state: EngineState, wallMs: number): EngineState {
  return tryEndpointRowClose(state, wallMs);
}
