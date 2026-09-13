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
  nonFinalsForChunkV2ActiveRow,
} from "./soniox-frame-split";
import { reduceCanonAppendWsNonChunkV2 } from "./reducer.non-chunk-v2";

export type ReduceContext = {
  ledger: AppendOnlyCanonLedger;
  wallMs: number;
  sameSpeakerLongPauseSplitMs?: number;
  chunkV2NativeTranslate?: boolean;
};

/**
 * Same N as non-chunk `SPEAKER_BREAK_CONFIRM_TOKENS` — two consecutive finals
 * must agree on the new language/speaker before the row freezes.
 */
const CHUNK_V2_BREAK_CONFIRM_TOKENS = 2;

function langBase(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t.split("-")[0]!.toLowerCase() : undefined;
}

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

/** False-alarm buffer: rewrite pending finals onto the open row's labels. */
function absorbChunkV2PendingIntoActive(state: EngineState): EngineState {
  const pending = state.pendingSpeakerFinals;
  const au = state.activeUtterance;
  if (!pending.length || !au) return clearChunkV2Pending(state);
  let next = clearChunkV2Pending(state);
  for (const tok of pending) {
    next = appendFinalToActive(
      next,
      {
        ...tok,
        speaker: au.speaker,
        language: au.language ?? tok.language,
      },
      { preserveEstablishedSpeaker: true },
    );
  }
  return next;
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
 * Delivery latency / endpoint-only quiet must not look like silence.
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
  // Do not pause-split a row that is still only a short acknowledgement.
  if (isChunkV2ShortAcknowledgement(committed)) return state;
  // Do not freeze while the last finalized token is still mid-word.
  if (isChunkV2OpenRowMidWord(committed)) return state;
  return {
    ...freezeActiveUtterance(state),
    endpointPending: false,
    endpointPendingAtMs: 0,
  };
}

/**
 * Restored chunk-v2 Soniox row contract (4feb41b4 + Original integrity):
 * - Append finals once; replace non-finals each frame
 * - Language / speaker flips require N consecutive agreeing finals (same N as non-chunk)
 * - Mid-word guard still absorbs flicker; short language-switch acks use normal debounce
 * - Never overwrite established row speaker labels
 */
function reduceChunkV2Restored(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  const wallMs = ctx.wallMs;

  let next: EngineState = state;
  const pauseSplitMs = ctx.sameSpeakerLongPauseSplitMs ?? SAME_SPEAKER_LONG_PAUSE_SPLIT_MS;
  const canon = canonTokensFromFrame(frame.tokens, frame.seq);
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

    const openMidWord = next.activeUtterance
      ? isChunkV2OpenRowMidWord(utteranceCommittedText(next.activeUtterance))
      : false;

    if (next.activeUtterance) {
      const langBreak = rowBreaksForLanguage(next.activeUtterance, ct);
      const spkBreak = !langBreak && rowBreaksForSpeaker(next.activeUtterance, ct);
      // Mid-word only: absorb LID/speaker flicker into the open row.
      // Do NOT special-case short acks on language break — that glued real
      // handoff words ("Perfect.", "Okay.") onto the previous language's bubble.
      // Short flicker still clears when the next final returns to the open language
      // (pending absorb below).
      if (openMidWord && (langBreak || spkBreak)) {
        next = absorbChunkV2PendingIntoActive(next);
      } else if (langBreak) {
        const tlg = langBase(ct.language);
        if (tlg && next.pendingLanguage === tlg) {
          const consecutive = (next.speakerChangeConsecutive ?? 0) + 1;
          if (consecutive >= CHUNK_V2_BREAK_CONFIRM_TOKENS) {
            next = {
              ...next,
              pendingLanguage: tlg,
              pendingSpeakerId: undefined,
              pendingSpeakerFinals: [...next.pendingSpeakerFinals, ct],
              speakerChangeConsecutive: consecutive,
              endpointPending: false,
              endpointPendingAtMs: 0,
            };
            next = confirmPendingBreakToActive(next);
            continue;
          }
          next = {
            ...next,
            pendingLanguage: tlg,
            pendingSpeakerId: undefined,
            pendingSpeakerFinals: [...next.pendingSpeakerFinals, ct],
            speakerChangeConsecutive: consecutive,
          };
          continue;
        }
        next = {
          ...next,
          pendingLanguage: tlg,
          pendingSpeakerId: undefined,
          pendingSpeakerFinals: [ct],
          speakerChangeConsecutive: 1,
        };
        continue;
      } else if (spkBreak) {
        const sid = speakerId(ct.speaker);
        if (sid && next.pendingSpeakerId === sid && !next.pendingLanguage) {
          const consecutive = (next.speakerChangeConsecutive ?? 0) + 1;
          if (consecutive >= CHUNK_V2_BREAK_CONFIRM_TOKENS) {
            next = {
              ...next,
              pendingSpeakerId: sid,
              pendingLanguage: undefined,
              pendingSpeakerFinals: [...next.pendingSpeakerFinals, ct],
              speakerChangeConsecutive: consecutive,
              endpointPending: false,
              endpointPendingAtMs: 0,
            };
            next = confirmPendingBreakToActive(next);
            continue;
          }
          next = {
            ...next,
            pendingSpeakerId: sid,
            pendingLanguage: undefined,
            pendingSpeakerFinals: [...next.pendingSpeakerFinals, ct],
            speakerChangeConsecutive: consecutive,
          };
          continue;
        }
        next = {
          ...next,
          pendingSpeakerId: sid,
          pendingLanguage: undefined,
          pendingSpeakerFinals: [ct],
          speakerChangeConsecutive: 1,
        };
        continue;
      } else if (next.pendingSpeakerFinals.length) {
        next = absorbChunkV2PendingIntoActive(next);
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

  const tailLang = tail.language?.split("-")[0]?.toLowerCase();
  const activeLang = next.activeUtterance?.language;
  const nfJoined = frameNonFinals.map(t => t.text).join("");
  const openCommitted = next.activeUtterance
    ? utteranceCommittedText(next.activeUtterance)
    : "";
  // While N=2 debounce is holding a break, do not force-freeze from NF language
  // tail — that confirmed early and left the first pending word stranded / split.
  const breakPending = next.pendingSpeakerFinals.length > 0;
  if (
    !breakPending &&
    activeLang &&
    tailLang &&
    tailLang !== activeLang &&
    frameNonFinals.length > 0 &&
    openCommitted.trim().length > 0 &&
    !isChunkV2ShortAcknowledgement(nfJoined) &&
    !isChunkV2OpenRowMidWord(openCommitted)
  ) {
    next = freezeActiveUtterance(next);
    next = { ...next, endpointPending: false, endpointPendingAtMs: 0 };
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
        nonFinalTokens: nonFinalsForChunkV2ActiveRow(frameNonFinals, {
          rowSpeaker,
          rowLanguage: row.language ?? tail.language,
          pendingSpeakerId: next.pendingSpeakerId,
          pendingLanguage: next.pendingLanguage,
          pendingFinalsCount: next.pendingSpeakerFinals.length,
        }),
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
