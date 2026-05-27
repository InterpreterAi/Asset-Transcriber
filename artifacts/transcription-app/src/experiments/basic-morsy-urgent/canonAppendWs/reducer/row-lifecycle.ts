import type { CanonToken, TranscriptRow } from "../types/canon-token";
import type { EngineState } from "../types/transcript";

import { joinCanonText } from "../types/canon-token";

/** Promoted live tail at freeze — trim outer whitespace only; punctuation/numbers stay verbatim from Soniox tokens. */
function promotedLiveSnapshot(tokens: readonly CanonToken[]): string {
  return joinCanonText(tokens).trimEnd();
}

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

/** Promote lingering live hypothesis into immutable finals, freeze row. */
export function finalizeTailRow(state: EngineState, wallMs: number): EngineState {
  if (state.rows.length === 0) return state;
  const idx = state.rows.length - 1;
  const tail = state.rows[idx]!;
  if (tail.finalized) return state;

  const liveJoinRaw = promotedLiveSnapshot(tail.liveTokens);
  const hasContent = tail.committedTokens.length > 0 || liveJoinRaw.length > 0;
  if (!hasContent) {
    return { ...state, rows: state.rows.slice(0, idx), metrics: state.metrics };
  }

  let committedTokens = [...tail.committedTokens];
  if (liveJoinRaw.length > 0) {
    committedTokens.push({
      token_id: `promoted-live-${state.lastFrameSeq}-${wallMs}`,
      text: liveJoinRaw,
      is_final: true,
      speaker: tail.speaker,
      language: tail.language,
    });
  }

  const timing = stretchRowTiming({ ...tail, committedTokens }, committedTokens);

  const finalizedRow: TranscriptRow = {
    ...tail,
    ...timing,
    committedTokens,
    liveTokens: [],
    finalized: true,
  };

  return {
    ...state,
    rows: [...state.rows.slice(0, idx), finalizedRow],
    metrics: { ...state.metrics, segmentCloseCount: state.metrics.segmentCloseCount + 1 },
  };
}

export function openTailRow(state: EngineState, speaker?: string, language?: string): EngineState {
  const id = `row-${state.nextRowSeq}`;
  const row: TranscriptRow = {
    row_id: id,
    speaker: speaker?.trim() || undefined,
    language: language?.trim() || undefined,
    committedTokens: [],
    liveTokens: [],
    finalized: false,
  };
  return {
    ...state,
    rows: [...state.rows, row],
    nextRowSeq: state.nextRowSeq + 1,
    activeSpeakerId: row.speaker ?? state.activeSpeakerId,
    activeLanguageId: row.language ?? state.activeLanguageId,
  };
}

/** Ensure an open (non-finalized) tail row exists. */
export function ensureOpenTail(state: EngineState, speakerHint?: string, languageHint?: string): EngineState {
  if (state.rows.length === 0) {
    return openTailRow(state, speakerHint, languageHint);
  }
  const tail = state.rows[state.rows.length - 1]!;
  if (!tail.finalized) return state;
  return openTailRow(state, speakerHint, languageHint);
}

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

/**
 * Close row + open new when Soniox token speaker/lang disagrees with anchored row identity.
 */
export function ensureSegmentBoundaryForCanonToken(
  state: EngineState,
  ct: CanonToken,
  wallMs: number,
): { state: EngineState; flippedSpeaker: boolean } {
  let next = ensureOpenTail(state, ct.speaker, ct.language);
  const idx = next.rows.length - 1;
  const tail = next.rows[idx]!;

  const sp = norm(ct.speaker);
  const lg = norm(ct.language);
  let tailSp = norm(tail.speaker);
  let tailLg = norm(tail.language);
  let flippedSpeaker = false;

  if (!tail.finalized && tail.committedTokens.length === 0 && tail.liveTokens.length === 0) {
    if (sp && !tailSp) tailSp = sp;
    if (lg && !tailLg) tailLg = lg;
    const patched: TranscriptRow = { ...tail, speaker: tailSp, language: tailLg };
    next = {
      ...next,
      rows: [...next.rows.slice(0, idx), patched],
      activeSpeakerId: tailSp ?? next.activeSpeakerId,
      activeLanguageId: tailLg ?? next.activeLanguageId,
    };
    return { state: next, flippedSpeaker: false };
  }

  const spConflict = sp && tailSp && sp !== tailSp;
  const lgConflict = lg && tailLg && lg !== tailLg;

  if (spConflict || lgConflict) {
    if (spConflict && tailSp && sp) flippedSpeaker = true;
    next = finalizeTailRow(next, wallMs);
    next = openTailRow(next, sp ?? tailSp, lg ?? tailLg);
  }

  return { state: next, flippedSpeaker };
}

/** Append one immutable final token — never mutates live hypothesis here (live is set per response). */
export function appendFinalCanonToTail(state: EngineState, ct: CanonToken, wallMs: number): EngineState {
  const finalTok: CanonToken = { ...ct, is_final: true };
  const { state: seg, flippedSpeaker } = ensureSegmentBoundaryForCanonToken(state, finalTok, wallMs);
  let next = seg;
  if (flippedSpeaker) {
    next = {
      ...next,
      metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
    };
  }

  let idx = next.rows.length - 1;
  let tail = next.rows[idx]!;
  if (tail.finalized) {
    next = openTailRow(next, finalTok.speaker, finalTok.language);
    idx = next.rows.length - 1;
    tail = next.rows[idx]!;
  }

  if (tail.committedTokens.some(t => t.token_id === finalTok.token_id)) {
    return next;
  }

  const committedTokens = [...tail.committedTokens, finalTok];
  const timingMerge = stretchRowTiming({ ...tail, committedTokens }, [finalTok]);

  const patched: TranscriptRow = {
    ...tail,
    ...timingMerge,
    committedTokens,
  };

  const rows = [...next.rows.slice(0, idx), patched];
  return {
    ...next,
    rows,
    activeSpeakerId: norm(patched.speaker) ?? norm(finalTok.speaker) ?? next.activeSpeakerId,
    activeLanguageId: norm(patched.language) ?? norm(finalTok.language) ?? next.activeLanguageId,
  };
}

/** Soniox realtime: replace tail live tokens with this response’s non-final list only — no cross-frame append. */
export function replaceTailLiveCanonTokens(
  state: EngineState,
  liveCanon: CanonToken[],
  _wallMs: number,
  tailSpeaker?: string,
  tailLanguage?: string,
): EngineState {
  let next = ensureOpenTail(state, tailSpeaker, tailLanguage);
  const idx = next.rows.length - 1;
  const tail = next.rows[idx]!;

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

  return {
    ...next,
    rows: [...next.rows.slice(0, idx), patch],
    metrics,
    activeSpeakerId: norm(patch.speaker) ?? next.activeSpeakerId,
    activeLanguageId: norm(patch.language) ?? next.activeLanguageId,
  };
}

export function applyEndpointAndOpenFresh(state: EngineState, wallMs: number): EngineState {
  let next = finalizeTailRow(state, wallMs);
  next = {
    ...next,
    endpointState: { active: true, lastEndpointMs: wallMs },
  };
  return openTailRow(next, next.activeSpeakerId ?? undefined, next.activeLanguageId ?? undefined);
}

export function applySilenceSegmentClose(state: EngineState, wallMs: number): EngineState {
  let next = finalizeTailRow(state, wallMs);
  return openTailRow(next, next.activeSpeakerId ?? undefined, next.activeLanguageId ?? undefined);
}
