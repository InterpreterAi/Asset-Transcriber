import type { CanonUtterance } from "../types/canon-utterance";
import type { CanonToken, TranscriptRow } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

import { finalSupersededByPaint } from "../policies/final-stabilization";
import type { SegmentCloseReason } from "../policies/segment-hold";
import { evaluateSegmentHoldForFinal } from "../policies/segment-hold";
import { createInitialSegmentHold } from "../policies/segment-hold";
import {
  committedHasOverlappingFinal,
  committedHasTokenId,
  reconcilePaintSuffixTokens,
} from "../policies/token-identity";
import { clearPaintBuffer } from "./paint-buffer";
import { emitDebugEvent } from "../telemetry/debug-events";

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

function stretchTiming(tokens: readonly CanonToken[]): { start_ms?: number; end_ms?: number } {
  let start: number | undefined;
  let end: number | undefined;
  for (const t of tokens) {
    if (typeof t.start_ms === "number") start = start === undefined ? t.start_ms : Math.min(start, t.start_ms);
    if (typeof t.end_ms === "number") end = end === undefined ? t.end_ms : Math.max(end, t.end_ms);
  }
  const out: { start_ms?: number; end_ms?: number } = {};
  if (start !== undefined) out.start_ms = start;
  if (end !== undefined) out.end_ms = end;
  return out;
}

import { deriveStructuralOwnership } from "../policies/structural-ownership";

function virtualCommittedTail(u: CanonUtterance): TranscriptRow {
  return {
    row_id: u.utterance_id,
    speaker: u.speaker,
    language: u.language,
    committedTokens: u.committedTokens,
    liveTokens: [],
    finalized: false,
    openedWallMs: u.utteranceOpenedWallMs,
  };
}

function emitUtteranceFinalizeDebug(args: {
  reason: SegmentCloseReason;
  u: CanonUtterance;
  wallMs: number;
  tokenCount: number;
}): void {
  const opened = args.u.utteranceOpenedWallMs ?? args.wallMs;
  emitDebugEvent({
    kind: "utterance_finalize",
    reason: args.reason,
    tokenCount: args.tokenCount,
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
    committedTokens: [],
    is_final: false,
    utteranceOpenedWallMs: wallMs,
  };
  return {
    ...state,
    activeUtterance: u,
    nextUtteranceSeq: state.nextUtteranceSeq + 1,
  };
}

/** `<end>` — maturity signal only; no freeze, no promotion, no scaffold. */
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

/**
 * Append one Soniox final after stabilization policy.
 * Opens structural utterance on first accepted final — never from paint.
 */
export function appendStabilizedFinal(
  state: EngineState,
  ct: CanonToken,
  wallMs: number,
): EngineState {
  const finalTok: CanonToken = { ...ct, is_final: true };

  if (finalSupersededByPaint(finalTok, state.paint)) {
    return {
      ...state,
      metrics: { ...state.metrics, deferredFinalCount: state.metrics.deferredFinalCount + 1 },
    };
  }

  let next = state.activeUtterance ? state : openActiveUtterance(state, wallMs);
  const au = next.activeUtterance;
  if (!au) return next;

  if (
    committedHasTokenId(au.committedTokens, finalTok.token_id) ||
    committedHasOverlappingFinal(au.committedTokens, finalTok)
  ) {
    return next;
  }

  const tail = virtualCommittedTail(au);
  const holdEval = evaluateSegmentHoldForFinal(tail, finalTok, wallMs, next.segmentHold, false);
  let segmentHold = holdEval.segmentHold;

  const utteranceBreaking =
    holdEval.shouldSplit &&
    (holdEval.splitReason === "speaker_switch" || holdEval.splitReason === "language_switch");

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
  } else if (holdEval.shouldSplit && holdEval.splitReason === "max_duration") {
    next = freezeUtteranceWithReconcile(next, wallMs, "max_duration");
    segmentHold = createInitialSegmentHold();
    next = { ...next, segmentHold };
    next = openActiveUtterance(next, wallMs);
  }

  const active = next.activeUtterance;
  if (!active) return next;

  if (
    committedHasTokenId(active.committedTokens, finalTok.token_id) ||
    committedHasOverlappingFinal(active.committedTokens, finalTok)
  ) {
    return { ...next, segmentHold };
  }

  const committedTokens = [...active.committedTokens, finalTok];
  const own = deriveStructuralOwnership(committedTokens);
  const timing = stretchTiming(committedTokens);

  const patched: CanonUtterance = {
    ...active,
    ...timing,
    ...own,
    committedTokens,
  };

  return { ...next, activeUtterance: patched, segmentHold };
}

/**
 * Freeze conversational utterance — reconcile paint at boundary; NEVER blind live→committed copy.
 */
export function freezeUtteranceWithReconcile(
  state: EngineState,
  wallMs: number,
  reason: SegmentCloseReason,
): EngineState {
  const au = state.activeUtterance;
  const baseCommitted = au?.committedTokens ?? [];
  const reconciled = reconcilePaintSuffixTokens(baseCommitted, state.paint.tokens);
  const merged = [...baseCommitted, ...reconciled];

  let finalizedUtterances = state.finalizedUtterances;
  if (merged.length > 0) {
    const own = deriveStructuralOwnership(merged);
    const timing = stretchTiming(merged);
    const frozen: CanonUtterance = {
      utterance_id: au?.utterance_id ?? `utt-${state.nextUtteranceSeq}`,
      ...own,
      ...timing,
      committedTokens: merged,
      is_final: true,
      utteranceOpenedWallMs: au?.utteranceOpenedWallMs ?? wallMs,
    };
    emitUtteranceFinalizeDebug({ reason, u: frozen, wallMs, tokenCount: merged.length });
    finalizedUtterances = [...state.finalizedUtterances, frozen];
  }

  let next: EngineState = {
    ...clearPaintBuffer(state),
    finalizedUtterances,
    activeUtterance: null,
    endpointPending: false,
    endpointPendingAtMs: 0,
    endpointPendingAudioProcMs: null,
    segmentHold: createInitialSegmentHold(),
    metrics: {
      ...state.metrics,
      utteranceFinalizedCount: state.metrics.utteranceFinalizedCount + (merged.length > 0 ? 1 : 0),
      stabilizationFreezeCount: state.metrics.stabilizationFreezeCount + 1,
    },
  };
  return next;
}

export function applyManualStructuralFreeze(state: EngineState, wallMs: number): EngineState {
  return freezeUtteranceWithReconcile(state, wallMs, "manual_finalize");
}

/** @deprecated alias */
export const applyManualFinalizeTail = applyManualStructuralFreeze;
