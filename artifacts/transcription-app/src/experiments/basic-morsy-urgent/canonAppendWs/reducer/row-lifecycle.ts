import type { CanonUtterance } from "../types/canon-utterance";
import type { CanonToken, TranscriptRow } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

import { finalSupersededByPaint } from "../policies/final-stabilization";
import type { SegmentCloseReason } from "../policies/segment-hold";
import { evaluateSegmentHoldForFinal } from "../policies/segment-hold";
import { createInitialSegmentHold } from "../policies/segment-hold";
import {
  appendFinalTextToCommitted,
  appendReconciledSuffix,
} from "../policies/immutable-prefix";
import { clearPaintBuffer, resyncMutableTailAfterCommitAdvance } from "./paint-buffer";
import { emitDebugEvent } from "../telemetry/debug-events";

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

function stretchTimingFromToken(t: CanonToken, prev?: { start_ms?: number; end_ms?: number }) {
  let start = prev?.start_ms;
  let end = prev?.end_ms;
  if (typeof t.start_ms === "number") start = start === undefined ? t.start_ms : Math.min(start, t.start_ms);
  if (typeof t.end_ms === "number") end = end === undefined ? t.end_ms : Math.max(end, t.end_ms);
  const out: { start_ms?: number; end_ms?: number } = {};
  if (start !== undefined) out.start_ms = start;
  if (end !== undefined) out.end_ms = end;
  return out;
}

function virtualCommittedTail(u: CanonUtterance): TranscriptRow {
  return {
    row_id: u.utterance_id,
    speaker: u.speaker,
    language: u.language,
    committedTokens: u.committedText
      ? [{ token_id: `${u.utterance_id}-committed-synthetic`, text: u.committedText, is_final: true }]
      : [],
    liveTokens: [],
    finalized: false,
    openedWallMs: u.utteranceOpenedWallMs,
  };
}

function emitUtteranceFinalizeDebug(args: {
  reason: SegmentCloseReason;
  u: CanonUtterance;
  wallMs: number;
}): void {
  const opened = args.u.utteranceOpenedWallMs ?? args.wallMs;
  emitDebugEvent({
    kind: "utterance_finalize",
    reason: args.reason,
    tokenCount: args.u.committedTokenIds.length,
    segmentCount: 1,
    utteranceDurationMs: args.wallMs - opened,
    priorSpeaker: args.u.speaker,
    priorLanguage: args.u.language,
  });
}

function openActiveUtterance(state: EngineState, wallMs: number): EngineState {
  const utterance_id = `utt-${state.nextUtteranceSeq}`;
  const u: CanonUtterance = {
    utterance_id,
    committedText: "",
    mutableTail: "",
    ownershipLocked: false,
    commitCursorUtf16: 0,
    committedTokenIds: [],
    is_final: false,
    utteranceOpenedWallMs: wallMs,
  };
  return {
    ...state,
    activeUtterance: u,
    nextUtteranceSeq: state.nextUtteranceSeq + 1,
  };
}

export function markEndpointPending(
  state: EngineState,
  wallMs: number,
  audioProcMs: number | null,
): EngineState {
  return {
    ...state,
    endpointPending: true,
    endpointPendingAtMs: wallMs,
    endpointPendingAudioProcMs: audioProcMs,
    lastSonioxEndpointWallMs: wallMs,
  };
}

function lockOwnershipFromFinal(u: CanonUtterance, finalTok: CanonToken): CanonUtterance {
  const sp = norm(finalTok.speaker) ?? u.speaker;
  const lg = norm(finalTok.language) ?? u.language;
  return {
    ...u,
    speaker: sp,
    language: lg,
    ownershipLocked: Boolean(sp || lg || u.ownershipLocked),
  };
}

/** Append-only advance of immutable committedText from one stabilized final. */
function advanceCommittedFromFinal(u: CanonUtterance, finalTok: CanonToken): CanonUtterance | null {
  if (u.committedTokenIds.includes(finalTok.token_id)) return null;

  const nextCommitted = appendFinalTextToCommitted(u.committedText, finalTok.text);
  if (nextCommitted === null) return null;

  const timing = stretchTimingFromToken(finalTok, u);
  return {
    ...u,
    ...timing,
    committedText: nextCommitted,
    commitCursorUtf16: nextCommitted.length,
    committedTokenIds: [...u.committedTokenIds, finalTok.token_id],
  };
}

export function appendStabilizedFinal(
  state: EngineState,
  ct: CanonToken,
  wallMs: number,
): EngineState {
  const finalTok: CanonToken = { ...ct, is_final: true };

  if (finalSupersededByPaint(finalTok, state.paint, state.activeUtterance)) {
    return {
      ...state,
      metrics: { ...state.metrics, deferredFinalCount: state.metrics.deferredFinalCount + 1 },
    };
  }

  let next = state.activeUtterance ? state : openActiveUtterance(state, wallMs);
  let au = next.activeUtterance;
  if (!au) return next;

  if (au.ownershipLocked) {
    const fsp = norm(finalTok.speaker);
    const flg = norm(finalTok.language);
    const asp = norm(au.speaker);
    const alg = norm(au.language);
    const spConflict = Boolean(fsp && asp && fsp !== asp);
    const lgConflict = Boolean(flg && alg && flg !== alg);
    if (spConflict || lgConflict) {
      const tail = virtualCommittedTail(au);
      const holdEval = evaluateSegmentHoldForFinal(tail, finalTok, wallMs, next.segmentHold, false);
      if (holdEval.shouldSplit) {
        next = freezeUtteranceWithReconcile(next, wallMs, holdEval.splitReason ?? "speaker_switch");
        if (holdEval.splitReason === "speaker_switch") {
          next = { ...next, metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 } };
        }
        next = { ...next, segmentHold: createInitialSegmentHold() };
        next = openActiveUtterance(next, wallMs);
        au = next.activeUtterance!;
      }
    }
  }

  au = next.activeUtterance;
  if (!au) return next;

  const tail = virtualCommittedTail(au);
  const holdEval = evaluateSegmentHoldForFinal(tail, finalTok, wallMs, next.segmentHold, false);
  let segmentHold = holdEval.segmentHold;

  const utteranceBreaking =
    holdEval.shouldSplit &&
    (holdEval.splitReason === "speaker_switch" ||
      holdEval.splitReason === "language_switch" ||
      holdEval.splitReason === "max_duration");

  if (utteranceBreaking && holdEval.splitReason) {
    next = freezeUtteranceWithReconcile(next, wallMs, holdEval.splitReason);
    if (holdEval.splitReason === "speaker_switch") {
      next = {
        ...next,
        metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
      };
    }
    segmentHold = createInitialSegmentHold();
    next = { ...next, segmentHold };
    next = openActiveUtterance(next, wallMs);
    au = next.activeUtterance!;
  }

  const advanced = advanceCommittedFromFinal(au, finalTok);
  if (!advanced) {
    return { ...next, segmentHold };
  }

  let patched = lockOwnershipFromFinal(advanced, finalTok);
  next = { ...next, activeUtterance: patched, segmentHold };
  next = resyncMutableTailAfterCommitAdvance(next);
  return next;
}

/** Freeze row — append-only reconcile of mutableTail into committedText; archive to consumed ledger. */
export function freezeUtteranceWithReconcile(
  state: EngineState,
  wallMs: number,
  reason: SegmentCloseReason,
): EngineState {
  const au = state.activeUtterance;
  const baseCommitted = au?.committedText ?? "";
  const finalCommitted = au ? appendReconciledSuffix(baseCommitted, au.mutableTail) : baseCommitted;

  let finalizedUtterances = state.finalizedUtterances;
  let consumedCommittedTexts = state.consumedCommittedTexts;
  let globalCommitCursorUtf16 = state.globalCommitCursorUtf16;

  if (finalCommitted.length > 0) {
    const frozen: CanonUtterance = {
      utterance_id: au?.utterance_id ?? `utt-${state.nextUtteranceSeq}`,
      committedText: finalCommitted,
      mutableTail: "",
      speaker: au?.speaker,
      language: au?.language,
      ownershipLocked: true,
      commitCursorUtf16: finalCommitted.length,
      committedTokenIds: au?.committedTokenIds ?? [],
      is_final: true,
      utteranceOpenedWallMs: au?.utteranceOpenedWallMs ?? wallMs,
      start_ms: au?.start_ms,
      end_ms: au?.end_ms,
    };
    emitUtteranceFinalizeDebug({ reason, u: frozen, wallMs });
    finalizedUtterances = [...state.finalizedUtterances, frozen];
    consumedCommittedTexts = [...state.consumedCommittedTexts, finalCommitted];
    globalCommitCursorUtf16 += finalCommitted.length;
  }

  return {
    ...clearPaintBuffer(state),
    finalizedUtterances,
    consumedCommittedTexts,
    globalCommitCursorUtf16,
    activeUtterance: null,
    endpointPending: false,
    endpointPendingAtMs: 0,
    endpointPendingAudioProcMs: null,
    segmentHold: createInitialSegmentHold(),
    metrics: {
      ...state.metrics,
      utteranceFinalizedCount: state.metrics.utteranceFinalizedCount + (finalCommitted.length > 0 ? 1 : 0),
      stabilizationFreezeCount: state.metrics.stabilizationFreezeCount + 1,
    },
  };
}

export function applyManualStructuralFreeze(state: EngineState, wallMs: number): EngineState {
  return freezeUtteranceWithReconcile(state, wallMs, "manual_finalize");
}

export const applyManualFinalizeTail = applyManualStructuralFreeze;
