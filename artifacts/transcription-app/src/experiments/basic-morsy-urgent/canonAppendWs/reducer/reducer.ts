import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { CanonToken } from "../types/canon-token";
import type { EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";
import type { Token } from "../types/tokens";

import { appendStabilizedFinal, markEndpointPending } from "./row-lifecycle";
import { replacePaintBuffer, syncPaintOntoActiveRow } from "./paint-buffer";
import { sonioxTokenToCanon } from "./soniox-to-canon";

export type ReduceContext = {
  ledger: AppendOnlyCanonLedger;
  wallMs: number;
};

function canonNonFinalFromStreamToken(t: Token): CanonToken {
  const ct = sonioxTokenToCanon(t);
  return { ...ct, is_final: false };
}

/**
 * Immutable-prefix ingestion:
 * 1) stabilized finals → append-only committedText
 * 2) non-finals → paint staging → mutableTail only (never committedText)
 * 3) endpoint → pending latch (no freeze)
 */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
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

  const nfCanon: CanonToken[] = [];
  for (const t of frame.tokens) {
    if (t.isFinal) {
      const ct = sonioxTokenToCanon(t);
      ctx.ledger.appendFinalCanon(ct);
      next = appendStabilizedFinal(next, ct, ctx.wallMs);
    } else if (typeof t.text === "string" && t.text.length > 0) {
      nfCanon.push(canonNonFinalFromStreamToken(t));
    }
  }

  next = replacePaintBuffer(next, nfCanon, ctx.wallMs, frame.seq);
  next = syncPaintOntoActiveRow(next);

  if (frame.tokens.length > 0 || frame.endpoint) {
    next = { ...next, lastTokenActivityWallMs: ctx.wallMs };
  }

  if (frame.endpoint) {
    next = markEndpointPending(next, ctx.wallMs, finProc);
  }

  return next;
}
