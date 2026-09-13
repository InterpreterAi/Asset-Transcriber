import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { CanonToken } from "../types/canon-token";
import type { EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";

import { isChunkV2OpenRowMidWord } from "../policies/mid-word-open";
import { SAME_SPEAKER_LONG_PAUSE_SPLIT_MS } from "../policies/segmentation-constants";
import { isChunkV2ShortAcknowledgement } from "../policies/short-acknowledgement";
import {
  appendFinalToActive,
  confirmPendingBreakToActive,
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

/**
 * Soniox real-time diarization emits temporary speaker switches that later
 * stabilize (speaker-diarization docs). Require two agreeing finals before a
 * new colored bubble.
 */
const CHUNK_V2_SPEAKER_BREAK_CONFIRM_TOKENS = 2;

function speakerId(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

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

/**
 * Same speaker, speech resumes after a long gap in the *recording* — new row.
 * Gap is Soniox audio time (incoming start_ms − prior end_ms), never client wall-clock.
 */
function tryLongPauseSplit(
  state: EngineState,
  incomingAudioStartMs: number | undefined,
  pauseSplitMs: number,
): EngineState {
  const au = state.activeUtterance;
  if (!au || state.lastTokenAudioEndMs === null) return state;
  if (incomingAudioStartMs === undefined) return state;
  const gap = incomingAudioStartMs - state.lastTokenAudioEndMs;
  if (gap < pauseSplitMs) return state;
  const hasContent =
    utteranceCommittedText(au).trim().length > 0 || utteranceLiveText(au).trim().length > 0;
  if (!hasContent) return state;
  const committed = utteranceCommittedText(au);
  if (isChunkV2ShortAcknowledgement(committed)) return state;
  if (isChunkV2OpenRowMidWord(committed)) return state;
  return {
    ...freezeActiveUtterance(state),
    endpointPending: false,
    endpointPendingAtMs: 0,
  };
}

/**
 * Soniox-faithful chunk-v2 bubbles:
 * - Group by stable speaker (debounce temporary diarization flips)
 * - Language-only code-switch stays on the same row
 * - Same speaker long audio pause (~5s) → new row
 * - Live typing continues (endpoint detection off — no sentence chunk dumps)
 */
function reduceChunkV2Restored(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  const wallMs = ctx.wallMs;

  let next: EngineState = state;
  const pauseSplitMs = ctx.sameSpeakerLongPauseSplitMs ?? SAME_SPEAKER_LONG_PAUSE_SPLIT_MS;
  const canon = stabilizeCanonSpeakers(canonTokensFromFrame(frame.tokens, frame.seq));
  if (canon.length > 0) {
    next = tryLongPauseSplit(next, minTokenAudioStartMs(canon), pauseSplitMs);
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
  next = {
    ...next,
    activeTranslationText: nextFinalTranslation,
    activeTranslationPreviewText:
      translationPreview.length > 0
        ? `${nextFinalTranslation}${translationPreview}`
        : nextFinalTranslation,
  };

  const frameFinals = canon.filter(t => t.is_final);
  const frameNonFinals = canon.filter(t => !t.is_final);

  for (const ct of frameFinals) {
    if (next.seenFinalTokenIds.includes(ct.token_id)) continue;
    next = { ...next, seenFinalTokenIds: [...next.seenFinalTokenIds, ct.token_id] };
    ctx.ledger.appendFinalCanon(ct);

    let skipAppend = false;

    if (next.activeUtterance) {
      const openMidWord = isChunkV2OpenRowMidWord(utteranceCommittedText(next.activeUtterance));
      const langBreak = rowBreaksForLanguage(next.activeUtterance, ct);
      const spkBreak = rowBreaksForSpeaker(next.activeUtterance, ct);
      const sid = speakerId(ct.speaker);

      if (openMidWord && langBreak && !spkBreak) {
        next = clearChunkV2Pending(next);
      } else if (langBreak && spkBreak) {
        // Different language + speaker: real handoff — confirm immediately.
        next = {
          ...next,
          pendingSpeakerId: sid,
          pendingLanguage: undefined,
          pendingSpeakerFinals: [ct],
          speakerChangeConsecutive: CHUNK_V2_SPEAKER_BREAK_CONFIRM_TOKENS,
        };
        next = confirmPendingBreakToActive(next);
        next = { ...next, endpointPending: false, endpointPendingAtMs: 0 };
        skipAppend = true;
      } else if (spkBreak && sid) {
        if (next.pendingSpeakerId === sid) {
          const consecutive = next.speakerChangeConsecutive + 1;
          const pending = [...next.pendingSpeakerFinals, ct];
          next = {
            ...next,
            pendingSpeakerId: sid,
            pendingLanguage: undefined,
            pendingSpeakerFinals: pending,
            speakerChangeConsecutive: consecutive,
          };
          if (consecutive >= CHUNK_V2_SPEAKER_BREAK_CONFIRM_TOKENS) {
            // Opens new colored row and appends pending — do not freezeActive (would double-close).
            next = confirmPendingBreakToActive(next);
            next = { ...next, endpointPending: false, endpointPendingAtMs: 0 };
          }
          skipAppend = true;
        } else {
          next = {
            ...next,
            pendingSpeakerId: sid,
            pendingLanguage: undefined,
            pendingSpeakerFinals: [ct],
            speakerChangeConsecutive: 1,
          };
          skipAppend = true;
        }
      } else {
        // Same speaker (incl. language-only): reject flicker pending by absorbing
        // any held finals onto this row under the established speaker label.
        if (next.pendingSpeakerFinals.length) {
          const pending = next.pendingSpeakerFinals;
          const au = next.activeUtterance;
          next = clearChunkV2Pending(next);
          for (const tok of pending) {
            next = appendFinalToActive(
              next,
              {
                ...tok,
                speaker: au!.speaker,
                language: au!.language ?? tok.language,
              },
              { preserveEstablishedSpeaker: true },
            );
          }
        } else {
          next = clearChunkV2Pending(next);
        }
      }
    }

    if (skipAppend) continue;

    if (!next.activeUtterance) {
      next = openActiveUtterance(next, ct.speaker, ct.language);
    }

    next = appendFinalToActive(next, ct, { preserveEstablishedSpeaker: true });
  }

  const tail = inferTailSpeakerLang(canon.length ? canon : frameNonFinals);
  const pendingSp = next.pendingSpeakerId?.trim();

  if (!next.activeUtterance && frameNonFinals.length > 0 && !pendingSp) {
    next = openActiveUtterance(next, tail.speaker, tail.language);
  }

  if (next.activeUtterance) {
    const row = next.activeUtterance;
    const rowSpeaker = row.speaker ?? tail.speaker;
    // Pending handoff: show new-speaker non-finals as live typing (projection also
    // paints pending finals). Confirmed path uses the open row's speaker filter.
    const liveNonFinals = pendingSp
      ? nonFinalsForRow(frameNonFinals, pendingSp)
      : nonFinalsForRow(frameNonFinals, rowSpeaker);
    next = {
      ...next,
      activeUtterance: {
        ...row,
        speaker: row.speaker ?? tail.speaker,
        language: row.language ?? tail.language,
        nonFinalTokens: liveNonFinals,
      },
    };
  }

  if (frame.tokens.length > 0) {
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
