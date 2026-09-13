import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { CanonToken } from "../types/canon-token";
import type { EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";

import { isChunkV2OpenRowMidWord } from "../policies/mid-word-open";
import { SAME_SPEAKER_LONG_PAUSE_SPLIT_MS } from "../policies/segmentation-constants";
import { isChunkV2ShortAcknowledgement } from "../policies/short-acknowledgement";
import {
  appendFinalToActive,
  freezeActiveUtterance,
  openActiveUtterance,
  rowBreaksForLanguage,
  rowBreaksForSpeaker,
} from "./row-lifecycle";
import { utteranceCommittedText, utteranceLiveText } from "../types/canon-utterance";
import {
  canonTokensFromFrame,
  translationPreviewTextFromFrame,
  translationTextFromFrame,
  inferTailSpeakerLang,
  nonFinalsForRow,
  stabilizeCanonSpeakers,
} from "./soniox-frame-split";
import { reduceCanonAppendWsNonChunkV2 } from "./reducer.non-chunk-v2";

export type ReduceContext = {
  ledger: AppendOnlyCanonLedger;
  wallMs: number;
  sameSpeakerLongPauseSplitMs?: number;
  chunkV2NativeTranslate?: boolean;
};

function clearChunkV2Pending(state: EngineState): EngineState {
  return {
    ...state,
    pendingSpeakerId: undefined,
    pendingLanguage: undefined,
    pendingSpeakerFinals: [],
    speakerChangeConsecutive: 0,
  };
}

function tokenAudioStartMs(t: CanonToken): number | undefined {
  return typeof t.start_ms === "number" && Number.isFinite(t.start_ms) ? t.start_ms : undefined;
}

/** Prefer end_ms; fall back to start_ms when Soniox omits end. */
function tokenAudioEndMs(t: CanonToken): number | undefined {
  if (typeof t.end_ms === "number" && Number.isFinite(t.end_ms)) return t.end_ms;
  return tokenAudioStartMs(t);
}

function minTokenAudioStartMs(tokens: readonly CanonToken[]): number | undefined {
  let min: number | undefined;
  for (const t of tokens) {
    const start = tokenAudioStartMs(t);
    if (start === undefined) continue;
    if (min === undefined || start < min) min = start;
  }
  return min;
}

function maxTokenAudioEndMs(tokens: readonly CanonToken[]): number | undefined {
  let max: number | undefined;
  for (const t of tokens) {
    const end = tokenAudioEndMs(t);
    if (end === undefined) continue;
    if (max === undefined || end > max) max = end;
  }
  return max;
}

function normSpeaker(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

/**
 * Same speaker resumes after a long quiet — new row.
 * Split if EITHER Soniox audio gap OR client wall quiet since last *speech*
 * tokens reaches the threshold (wall-only silence was invisible when we only
 * measured audio, and audio-only missed real pauses when delayed finals filled time).
 */
function tryLongPauseSplit(
  state: EngineState,
  incomingAudioStartMs: number | undefined,
  pauseSplitMs: number,
  wallMs: number,
): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;
  const hasContent =
    utteranceCommittedText(au).trim().length > 0 || utteranceLiveText(au).trim().length > 0;
  if (!hasContent) return state;
  const committed = utteranceCommittedText(au);
  if (isChunkV2ShortAcknowledgement(committed)) return state;
  if (isChunkV2OpenRowMidWord(committed)) return state;

  let shouldSplit = false;
  const audioGap =
    incomingAudioStartMs !== undefined && state.lastTokenAudioEndMs !== null
      ? incomingAudioStartMs - state.lastTokenAudioEndMs
      : undefined;
  if (audioGap !== undefined && audioGap >= pauseSplitMs) {
    shouldSplit = true;
  } else if (
    state.lastTokenActivityWallMs > 0 &&
    wallMs - state.lastTokenActivityWallMs >= pauseSplitMs
  ) {
    // Wall quiet counts only when audio also looks interrupted (or timestamps
    // missing). Pure delivery delay = long wall + tiny audio gap → stay.
    const MIN_AUDIO_GAP_FOR_WALL_SPLIT_MS = 800;
    if (audioGap === undefined || audioGap >= MIN_AUDIO_GAP_FOR_WALL_SPLIT_MS) {
      shouldSplit = true;
    }
  }
  if (!shouldSplit) return state;

  return {
    ...freezeActiveUtterance(clearChunkV2Pending(state)),
    endpointPending: false,
    endpointPendingAtMs: 0,
  };
}

/** Freeze current row and prepare a clean handoff (no pending buffer / chunk dump). */
function freezeForSpeakerHandoff(state: EngineState): EngineState {
  return {
    ...freezeActiveUtterance(clearChunkV2Pending(state)),
    endpointPending: false,
    endpointPendingAtMs: 0,
    metrics: {
      ...state.metrics,
      speakerFlipCount: state.metrics.speakerFlipCount + 1,
    },
  };
}

/**
 * Soniox-faithful chunk-v2 bubbles:
 * - New speaker → open new colored row immediately (N=1) so non-finals keep typing live
 *   (Soniox docs: display NF instantly; finals append). No pending freeze→chunk dump.
 * - Intra-frame flicker collapsed via stabilizeCanonSpeakers
 * - Language-only code-switch stays on the same row
 * - Same speaker long quiet (~5s audio OR wall) → new row
 */
function reduceChunkV2Restored(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  const wallMs = ctx.wallMs;

  let next: EngineState = state;
  const pauseSplitMs = ctx.sameSpeakerLongPauseSplitMs ?? SAME_SPEAKER_LONG_PAUSE_SPLIT_MS;
  const canon = stabilizeCanonSpeakers(canonTokensFromFrame(frame.tokens, frame.seq));
  if (canon.length > 0) {
    next = tryLongPauseSplit(next, minTokenAudioStartMs(canon), pauseSplitMs, wallMs);
  }

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

  next = {
    ...next,
    lastFrameSeq: frame.seq,
    lastFinalAudioProcMs: finProc !== null ? finProc : next.lastFinalAudioProcMs,
    lastTotalAudioProcMs: totProc !== null ? totProc : next.lastTotalAudioProcMs,
    lastHypothesisLagMs: lagComputed !== null ? lagComputed : next.lastHypothesisLagMs,
  };

  const translationChunk = translationTextFromFrame(frame.tokens);
  const translationPreview = translationPreviewTextFromFrame(frame.tokens);
  const nextFinalTranslation =
    translationChunk.length > 0
      ? (next.activeTranslationText ?? "") + translationChunk
      : next.activeTranslationText ?? "";
  let nextPreviewTranslation: string;
  if (translationPreview.length > 0) {
    nextPreviewTranslation = `${nextFinalTranslation}${translationPreview}`;
  } else if (translationChunk.length > 0) {
    nextPreviewTranslation = nextFinalTranslation;
  } else {
    const prevPreview = next.activeTranslationPreviewText ?? "";
    nextPreviewTranslation =
      prevPreview.length > nextFinalTranslation.length ? prevPreview : nextFinalTranslation;
  }
  next = {
    ...next,
    activeTranslationText: nextFinalTranslation,
    activeTranslationPreviewText: nextPreviewTranslation,
  };

  const frameFinals = canon.filter(t => t.is_final);
  const frameNonFinals = canon.filter(t => !t.is_final);

  for (const ct of frameFinals) {
    if (next.seenFinalTokenIds.includes(ct.token_id)) continue;
    next = { ...next, seenFinalTokenIds: [...next.seenFinalTokenIds, ct.token_id] };
    ctx.ledger.appendFinalCanon(ct);

    if (next.activeUtterance) {
      const openMidWord = isChunkV2OpenRowMidWord(utteranceCommittedText(next.activeUtterance));
      const langBreak = rowBreaksForLanguage(next.activeUtterance, ct);
      const spkBreak = rowBreaksForSpeaker(next.activeUtterance, ct);

      if (openMidWord && langBreak && !spkBreak) {
        // Mid-word LID flicker — stay.
        next = clearChunkV2Pending(next);
      } else if (spkBreak) {
        // Real or diarized speaker change: open immediately so live typing never stalls.
        // stabilizeCanonSpeakers already collapsed one-token A→B→A flicker inside the frame.
        next = freezeForSpeakerHandoff(next);
      } else {
        next = clearChunkV2Pending(next);
      }
    }

    if (!next.activeUtterance) {
      next = openActiveUtterance(next, ct.speaker, ct.language);
    }

    next = appendFinalToActive(next, ct, { preserveEstablishedSpeaker: true });
  }

  const tail = inferTailSpeakerLang(canon.length ? canon : frameNonFinals);
  const activeSp = normSpeaker(next.activeUtterance?.speaker);
  const tailSp = normSpeaker(tail.speaker);
  const openCommitted = next.activeUtterance
    ? utteranceCommittedText(next.activeUtterance)
    : "";

  // Non-finals already show a new speaker — open the new colored row now so
  // typing follows speech before the first final (Soniox: display NF instantly).
  if (
    next.activeUtterance &&
    activeSp &&
    tailSp &&
    activeSp !== tailSp &&
    frameNonFinals.length > 0 &&
    openCommitted.trim().length > 0 &&
    !isChunkV2OpenRowMidWord(openCommitted)
  ) {
    next = freezeForSpeakerHandoff(next);
  }

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

  // Only original speech advances "activity" — translation-only frames must not
  // hide a real wall-clock pause from the 5s split.
  if (canon.length > 0) {
    next = { ...next, lastTokenActivityWallMs: wallMs };
  }

  const audioEnd = maxTokenAudioEndMs(canon);
  if (audioEnd !== undefined) {
    next = {
      ...next,
      lastTokenAudioEndMs:
        next.lastTokenAudioEndMs === null
          ? audioEnd
          : Math.max(next.lastTokenAudioEndMs, audioEnd),
    };
  }

  if (frame.endpoint) {
    next = {
      ...next,
      endpointPending: true,
      endpointPendingAtMs: wallMs,
    };
  }

  return next;
}

/**
 * Dispatch: restored chunk-v2 behavior vs daffcfbf non-chunk canonAppendWs path.
 * Trial / Basic / Professional Soniox defaults use chunk-v2 (`chunkV2NativeTranslate`).
 */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  if (ctx.chunkV2NativeTranslate) {
    return reduceChunkV2Restored(state, frame, ctx);
  }
  return reduceCanonAppendWsNonChunkV2(state, frame, ctx);
}

/** PCM tick hook — row splits happen on speech resume in {@link reduceCanonAppendWs}, not on idle PCM. */
export function maybeCloseRowAfterEndpointQuiet(state: EngineState, _wallMs: number): EngineState {
  return state;
}
