import type { CanonUtterance } from "../types/canon-utterance";
import type { CanonToken, TranscriptRow } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

import { joinCanonText } from "../types/canon-token";
import type { SegmentCloseReason } from "../policies/segment-hold";
import {
  evaluateSegmentHoldForFinal,
  stripLivePrefixOverlappingCommittedSuffix,
} from "../policies/segment-hold";
import { createInitialSegmentHold } from "../policies/segment-hold";
import { emitDebugEvent } from "../telemetry/debug-events";
import { syncCanonUtteranceRollup } from "../projection/utterance-rollup";

function stretchRowTiming(row: TranscriptRow, extras: Iterable<CanonToken>): { start_ms?: number; end_ms?: number } {
  let start = row.start_ms;
  let end = row.end_ms;
  for (const t of extras) {
    if (typeof t.start_ms === "number") {
      start = start === undefined ? t.start_ms : Math.min(start, t.start_ms);
    }
    if (typeof t.end_ms === "number") {
      end = end === undefined ? t.end_ms : Math.max(end, t.end_ms);
    }
  }
  const out: { start_ms?: number; end_ms?: number } = {};
  if (start !== undefined) out.start_ms = start;
  if (end !== undefined) out.end_ms = end;
  return out;
}

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

/** Promotes live finals on one low-level Soniox segment row. */
export function finalizeSegmentPromotingLive(seg: TranscriptRow): TranscriptRow {
  if (seg.finalized) return seg;
  const promoted = seg.liveTokens.map(t => ({ ...t, is_final: true }));
  const committedTokens = [...seg.committedTokens, ...promoted];
  const timing = stretchRowTiming({ ...seg, committedTokens }, committedTokens);
  const hasPayload = committedTokens.length > 0;
  if (!hasPayload) {
    return {
      ...seg,
      committedTokens: [],
      liveTokens: [],
      finalized: true,
    };
  }
  return {
    ...seg,
    ...timing,
    committedTokens,
    liveTokens: [],
    finalized: true,
  };
}

function emitSegmentCloseDebug(args: {
  reason: SegmentCloseReason;
  row: TranscriptRow;
  wallMs: number;
  nextSpeakerHint?: string;
  nextLangHint?: string;
}): void {
  const { row, wallMs } = args;
  const tokenCount = row.committedTokens.length + row.liveTokens.length;
  const opened = row.openedWallMs ?? wallMs;
  emitDebugEvent({
    kind: "segment_close",
    reason: args.reason,
    tokenCount,
    utteranceDurationMs: wallMs - opened,
    priorSpeaker: row.speaker,
    priorLanguage: row.language,
    nextSpeaker: args.nextSpeakerHint,
    nextLanguage: args.nextLangHint,
  });
}

function emitUtteranceFinalizeDebug(args: {
  reason: SegmentCloseReason;
  u: CanonUtterance;
  wallMs: number;
  flattenedTokenCount: number;
  segmentCount: number;
  nextSpeakerHint?: string;
  nextLangHint?: string;
}): void {
  const opened = args.u.utteranceOpenedWallMs ?? args.wallMs;
  emitDebugEvent({
    kind: "utterance_finalize",
    reason: args.reason,
    tokenCount: args.flattenedTokenCount,
    segmentCount: args.segmentCount,
    utteranceDurationMs: args.wallMs - opened,
    priorSpeaker: args.u.speaker,
    priorLanguage: args.u.language,
    nextSpeaker: args.nextSpeakerHint,
    nextLanguage: args.nextLangHint,
  });
}

/** Seal the active conversational utterance and archive it — Intercall-shaped unit of UI history. */
export function freezeActiveUtterance(
  state: EngineState,
  wallMs: number,
  reason: SegmentCloseReason,
  opts?: { nextSpeakerHint?: string; nextLangHint?: string },
): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;

  const uSynced = syncCanonUtteranceRollup(au);
  const promotedSegsPre = uSynced.segments.map(finalizeSegmentPromotingLive);

  const flatCommittedTokens = promotedSegsPre.flatMap(s => s.committedTokens);

  const hasPayload = flatCommittedTokens.length > 0;
  emitUtteranceFinalizeDebug({
    reason,
    u: uSynced,
    wallMs,
    flattenedTokenCount: flatCommittedTokens.length,
    segmentCount: promotedSegsPre.length,
    nextSpeakerHint: opts?.nextSpeakerHint,
    nextLangHint: opts?.nextLangHint,
  });

  let start = uSynced.start_ms;
  let end = uSynced.end_ms;
  for (const t of flatCommittedTokens) {
    if (typeof t.start_ms === "number") start = start === undefined ? t.start_ms : Math.min(start, t.start_ms);
    if (typeof t.end_ms === "number") end = end === undefined ? t.end_ms : Math.max(end, t.end_ms);
  }

  const frozen: CanonUtterance = {
    ...uSynced,
    segments: promotedSegsPre,
    committedTokens: flatCommittedTokens,
    liveTokens: [],
    is_final: true,
    start_ms: start,
    end_ms: end,
  };

  const finalizedUtterances = hasPayload ? [...state.finalizedUtterances, frozen] : state.finalizedUtterances;

  return {
    ...state,
    finalizedUtterances,
    activeUtterance: null,
    metrics: {
      ...state.metrics,
      utteranceFinalizedCount: state.metrics.utteranceFinalizedCount + (hasPayload ? 1 : 0),
    },
  };
}

export function scaffoldEmptyActiveUtterance(
  state: EngineState,
  wallMs: number,
  speakerHint?: string,
  languageHint?: string,
): EngineState {
  const utterance_id = `utt-${state.nextUtteranceSeq}`;
  const rid = `seg-${state.nextSegmentRowSeq}`;
  const sp = norm(speakerHint);
  const lg = norm(languageHint);
  const base: CanonUtterance = syncCanonUtteranceRollup({
    utterance_id,
    speaker: sp,
    language: lg,
    segments: [
      {
        row_id: rid,
        speaker: sp,
        language: lg,
        committedTokens: [],
        liveTokens: [],
        finalized: false,
        openedWallMs: wallMs,
      },
    ],
    committedTokens: [],
    liveTokens: [],
    is_final: false,
    utteranceOpenedWallMs: wallMs,
  });

  return {
    ...state,
    activeUtterance: base,
    nextUtteranceSeq: state.nextUtteranceSeq + 1,
    nextSegmentRowSeq: state.nextSegmentRowSeq + 1,
    activeSpeakerId: sp ?? state.activeSpeakerId,
    activeLanguageId: lg ?? state.activeLanguageId,
  };
}

/** Finalizes only the trailing low-level Soniox segment (`max_duration` soft split inside one utterance). */
export function finalizeOpenSegmentTail(
  state: EngineState,
  wallMs: number,
  reason: SegmentCloseReason,
  hints?: { nextSpeakerHint?: string; nextLangHint?: string },
): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;
  const synced = syncCanonUtteranceRollup(au);
  const segments = synced.segments;
  if (segments.length === 0) return state;
  const idx = segments.length - 1;
  const tail = segments[idx]!;
  if (tail.finalized) return { ...state, activeUtterance: synced };

  const promoted = tail.liveTokens.map(t => ({ ...t, is_final: true }));
  const committedTokens = [...tail.committedTokens, ...promoted];
  emitSegmentCloseDebug({ reason, row: tail, wallMs, ...hints });

  const hasPayload = committedTokens.length > 0;
  if (!hasPayload) {
    const dropped = [...segments.slice(0, idx)];
    const droppedUt = dropped.length === 0 ? null : syncCanonUtteranceRollup({ ...synced, segments: dropped });
    return {
      ...state,
      activeUtterance: droppedUt,
      metrics: { ...state.metrics, segmentCloseCount: state.metrics.segmentCloseCount + 1 },
    };
  }

  const timing = stretchRowTiming({ ...tail, committedTokens }, committedTokens);
  const finalizedRow: TranscriptRow = {
    ...tail,
    ...timing,
    committedTokens,
    liveTokens: [],
    finalized: true,
  };
  const nextSegs = [...segments.slice(0, idx), finalizedRow];
  return {
    ...state,
    activeUtterance: syncCanonUtteranceRollup({ ...synced, segments: nextSegs }),
    metrics: { ...state.metrics, segmentCloseCount: state.metrics.segmentCloseCount + 1 },
  };
}

export function appendOpenSegmentRow(state: EngineState, wallMs: number, speaker?: string, language?: string): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;
  const synced = syncCanonUtteranceRollup(au);
  const sp = norm(speaker) ?? norm(synced.speaker);
  const lg = norm(language) ?? norm(synced.language);
  const rid = `seg-${state.nextSegmentRowSeq}`;
  const nextRow: TranscriptRow = {
    row_id: rid,
    speaker: sp,
    language: lg,
    committedTokens: [],
    liveTokens: [],
    finalized: false,
    openedWallMs: wallMs,
  };
  const nextAu = syncCanonUtteranceRollup({
    ...synced,
    segments: [...synced.segments, nextRow],
  });
  return {
    ...state,
    activeUtterance: nextAu,
    nextSegmentRowSeq: state.nextSegmentRowSeq + 1,
    activeSpeakerId: sp ?? state.activeSpeakerId,
    activeLanguageId: lg ?? state.activeLanguageId,
  };
}

/** Ensure conversational utterance + open low-level Soniox segment row exist. */
export function ensureOpenTail(state: EngineState, wallMs: number, speakerHint?: string, languageHint?: string): EngineState {
  if (!state.activeUtterance) {
    return scaffoldEmptyActiveUtterance(state, wallMs, speakerHint, languageHint);
  }
  let next = syncCanonUtteranceRollup(state.activeUtterance);
  let segs = next.segments;
  if (segs.length === 0) {
    const rid = `seg-${state.nextSegmentRowSeq}`;
    segs = [
      {
        row_id: rid,
        speaker: norm(next.speaker ?? speakerHint),
        language: norm(next.language ?? languageHint),
        committedTokens: [],
        liveTokens: [],
        finalized: false,
        openedWallMs: wallMs,
      },
    ];
    return {
      ...state,
      activeUtterance: syncCanonUtteranceRollup({
        ...next,
        segments: segs,
        speaker: norm(next.speaker ?? speakerHint) ?? next.speaker,
        language: norm(next.language ?? languageHint) ?? next.language,
      }),
      nextSegmentRowSeq: state.nextSegmentRowSeq + 1,
    };
  }
  const tail = segs[segs.length - 1]!;
  if (!tail.finalized) {
    return {
      ...state,
      activeUtterance: next,
      activeSpeakerId: norm(tail.speaker ?? next.speaker ?? speakerHint) ?? state.activeSpeakerId,
      activeLanguageId: norm(tail.language ?? next.language ?? languageHint) ?? state.activeLanguageId,
    };
  }

  const rid = `seg-${state.nextSegmentRowSeq}`;
  const nr: TranscriptRow = {
    row_id: rid,
    speaker: norm(tail.speaker ?? next.speaker ?? speakerHint),
    language: norm(tail.language ?? next.language ?? languageHint),
    committedTokens: [],
    liveTokens: [],
    finalized: false,
    openedWallMs: wallMs,
  };
  next = syncCanonUtteranceRollup({ ...next, segments: [...segs, nr] });
  return {
    ...state,
    activeUtterance: next,
    nextSegmentRowSeq: state.nextSegmentRowSeq + 1,
    activeSpeakerId: nr.speaker ?? state.activeSpeakerId,
    activeLanguageId: nr.language ?? state.activeLanguageId,
  };
}

function patchActiveSegments(state: EngineState, segs: TranscriptRow[]): EngineState {
  if (!state.activeUtterance) return state;
  return {
    ...state,
    activeUtterance: syncCanonUtteranceRollup({ ...state.activeUtterance, segments: segs }),
  };
}

export function stripTailLiveOverlap(state: EngineState): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;
  const synced = syncCanonUtteranceRollup(au);
  const idx = synced.segments.length - 1;
  if (idx < 0) return state;
  const tail = synced.segments[idx]!;
  if (tail.finalized) return state;
  const stripped = stripLivePrefixOverlappingCommittedSuffix(tail);
  return patchActiveSegments(state, [...synced.segments.slice(0, idx), stripped]);
}

export function appendFinalCanonToTail(state: EngineState, ct: CanonToken, wallMs: number): EngineState {
  const finalTok: CanonToken = { ...ct, is_final: true };
  let next = ensureOpenTail(state, wallMs, finalTok.speaker, finalTok.language);
  let au = next.activeUtterance;
  if (!au) return next;

  au = syncCanonUtteranceRollup(au);
  let idx = au.segments.length - 1;
  let tail = au.segments[idx]!;

  if (!tail.finalized && tail.committedTokens.length === 0 && tail.liveTokens.length === 0) {
    let tailSp = norm(tail.speaker);
    let tailLg = norm(tail.language);
    const sp = norm(finalTok.speaker);
    const lg = norm(finalTok.language);
    if (sp && !tailSp) tailSp = sp;
    if (lg && !tailLg) tailLg = lg;
    tail = { ...tail, speaker: tailSp, language: tailLg };
    next = patchActiveSegments(next, [...au.segments.slice(0, idx), tail]);
  }

  au = syncCanonUtteranceRollup(next.activeUtterance!);
  idx = au.segments.length - 1;
  tail = au.segments[idx]!;

  if (tail.finalized) {
    next = ensureOpenTail(next, wallMs, finalTok.speaker, finalTok.language);
    au = syncCanonUtteranceRollup(next.activeUtterance!);
    idx = au.segments.length - 1;
    tail = au.segments[idx]!;
  }

  if (!tail.finalized && tail.committedTokens.some(t => t.token_id === finalTok.token_id)) {
    return next;
  }

  const holdEval = evaluateSegmentHoldForFinal(tail, finalTok, wallMs, next.segmentHold, false);
  let metrics = next.metrics;
  let segmentHold = holdEval.segmentHold;

  const utteranceBreaking =
    holdEval.shouldSplit &&
    (holdEval.splitReason === "speaker_switch" || holdEval.splitReason === "language_switch");

  if (utteranceBreaking && holdEval.splitReason) {
    const spHint = norm(finalTok.speaker) ?? norm(tail.speaker);
    const lgHint = norm(finalTok.language) ?? norm(tail.language);

    next = freezeActiveUtterance(next, wallMs, holdEval.splitReason, {
      nextSpeakerHint: spHint,
      nextLangHint: lgHint,
    });
    if (holdEval.splitReason === "speaker_switch") {
      metrics = { ...metrics, speakerFlipCount: metrics.speakerFlipCount + 1 };
    }
    segmentHold = createInitialSegmentHold();
    next = { ...next, segmentHold, metrics };
    next = ensureOpenTail(next, wallMs, spHint ?? finalTok.speaker, lgHint ?? finalTok.language);

    au = syncCanonUtteranceRollup(next.activeUtterance!);
    idx = au.segments.length - 1;
    tail = au.segments[idx]!;
  } else if (holdEval.shouldSplit && holdEval.splitReason === "max_duration") {
    next = finalizeOpenSegmentTail(next, wallMs, "max_duration", {
      nextSpeakerHint: norm(finalTok.speaker) ?? norm(tail.speaker),
      nextLangHint: norm(finalTok.language) ?? norm(tail.language),
    });
    next = appendOpenSegmentRow(
      next,
      wallMs,
      norm(finalTok.speaker ?? tail.speaker),
      norm(finalTok.language ?? tail.language),
    );
    segmentHold = createInitialSegmentHold();
    au = syncCanonUtteranceRollup(next.activeUtterance!);
    idx = au.segments.length - 1;
    tail = au.segments[idx]!;
  }

  if (!tail.finalized && tail.committedTokens.some(t => t.token_id === finalTok.token_id)) {
    return { ...next, segmentHold };
  }

  const committedTokens = [...tail.committedTokens, finalTok];
  const timingMerge = stretchRowTiming({ ...tail, committedTokens }, [finalTok]);

  const patched: TranscriptRow = {
    ...tail,
    ...timingMerge,
    committedTokens,
    speaker: norm(tail.speaker) ?? norm(finalTok.speaker),
    language: norm(tail.language) ?? norm(finalTok.language),
  };

  next = patchActiveSegments(next, [...au.segments.slice(0, idx), patched]);
  return {
    ...next,
    segmentHold,
    activeSpeakerId: norm(patched.speaker) ?? norm(finalTok.speaker) ?? next.activeSpeakerId,
    activeLanguageId: norm(patched.language) ?? norm(finalTok.language) ?? next.activeLanguageId,
  };
}

/** Soniox realtime: replace open tail live hypothesis (last non-final segment) only. */
export function replaceTailLiveCanonTokens(
  state: EngineState,
  liveCanon: CanonToken[],
  wallMs: number,
  tailSpeaker?: string,
  tailLanguage?: string,
): EngineState {
  let next = ensureOpenTail(state, wallMs, tailSpeaker, tailLanguage);
  const au = next.activeUtterance;
  if (!au) return next;
  const synced = syncCanonUtteranceRollup(au);
  const ix = synced.segments.length - 1;
  const tail = synced.segments[ix]!;

  const prevLive = joinCanonText(tail.liveTokens);
  let metrics = next.metrics;
  if (liveCanon.length === 0 && prevLive.length > 0) {
    metrics = { ...metrics, staleTailCount: metrics.staleTailCount + 1 };
  }

  const timingNf = stretchRowTiming(tail, liveCanon);
  const patch: TranscriptRow = {
    ...tail,
    ...timingNf,
    liveTokens: liveCanon,
    speaker: tail.speaker ?? norm(tailSpeaker),
    language: tail.language ?? norm(tailLanguage),
  };

  next = patchActiveSegments(next, [...synced.segments.slice(0, ix), patch]);
  return {
    ...next,
    metrics,
    activeSpeakerId: norm(patch.speaker) ?? next.activeSpeakerId,
    activeLanguageId: norm(patch.language) ?? next.activeLanguageId,
  };
}

export function applyEndpointAndOpenFresh(state: EngineState, wallMs: number): EngineState {
  const spHint = state.activeSpeakerId ?? undefined;
  const lgHint = state.activeLanguageId ?? undefined;
  let next = freezeActiveUtterance(state, wallMs, "endpoint", {
    nextSpeakerHint: spHint,
    nextLangHint: lgHint,
  });
  next = {
    ...next,
    endpointState: { active: true, lastEndpointMs: wallMs },
    segmentHold: createInitialSegmentHold(),
  };
  return scaffoldEmptyActiveUtterance(next, wallMs, spHint, lgHint);
}

export function applySilenceUtteranceClose(state: EngineState, wallMs: number): EngineState {
  const spHint = state.activeSpeakerId ?? undefined;
  const lgHint = state.activeLanguageId ?? undefined;
  let next = freezeActiveUtterance(state, wallMs, "silence", {
    nextSpeakerHint: spHint,
    nextLangHint: lgHint,
  });
  next = {
    ...next,
    segmentHold: createInitialSegmentHold(),
  };
  return scaffoldEmptyActiveUtterance(next, wallMs, spHint, lgHint);
}

/** @deprecated use {@link applySilenceUtteranceClose} — alias retained for churn-free imports. */
export const applySilenceSegmentClose = applySilenceUtteranceClose;

export function applyManualFinalizeTail(state: EngineState, wallMs: number): EngineState {
  const spHint = state.activeSpeakerId ?? undefined;
  const lgHint = state.activeLanguageId ?? undefined;
  let next = freezeActiveUtterance(state, wallMs, "manual_finalize", {
    nextSpeakerHint: spHint,
    nextLangHint: lgHint,
  });
  return scaffoldEmptyActiveUtterance(
    {
      ...next,
      segmentHold: createInitialSegmentHold(),
    },
    wallMs,
    spHint,
    lgHint,
  );
}
