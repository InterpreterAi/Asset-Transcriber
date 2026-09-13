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
 * August / a029ed6a Soniox bubble timing (chunk-v2):
 * - New speaker → freeze immediately and open a new colored row (N=1)
 * - Language-only code-switch (same speaker) → stay on the same row
 * - Same speaker long audio pause → new row
 * - Live non-finals keep typing on the open row (no pending buffer / chunk dump)
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

    if (next.activeUtterance) {
      const openMidWord = isChunkV2OpenRowMidWord(utteranceCommittedText(next.activeUtterance));
      const langBreak = rowBreaksForLanguage(next.activeUtterance, ct);
      // Independent of language — reducer decides handoff vs code-switch.
      const spkBreak = rowBreaksForSpeaker(next.activeUtterance, ct);

      if (openMidWord && langBreak && !spkBreak) {
        // Mid-word LID flicker only — never swallow a real speaker handoff.
        next = clearChunkV2Pending(next);
      } else if (langBreak && spkBreak) {
        // Genuine handoff: different language AND different speaker.
        next = freezeActiveUtterance(next);
        next = {
          ...next,
          endpointPending: false,
          endpointPendingAtMs: 0,
          speakerChangeConsecutive: 0,
          metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
        };
      } else if (spkBreak) {
        // New speaker (same language) — immediate new colored segment (Aug 25 / a029).
        next = freezeActiveUtterance(next);
        next = {
          ...next,
          endpointPending: false,
          endpointPendingAtMs: 0,
          speakerChangeConsecutive: 0,
          metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
        };
      } else {
        // Same speaker (incl. language-only code-switch): stay on this row.
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
  const openCommitted = next.activeUtterance
    ? utteranceCommittedText(next.activeUtterance)
    : "";
  // Same-speaker language flicker in non-finals must not shatter the row
  // (Aug kept code-switch on one bubble; NF lang freeze only when speaker also differs).
  const activeSp = next.activeUtterance?.speaker?.trim();
  const tailSp = tail.speaker?.trim();
  const speakerChangedInNf = Boolean(activeSp && tailSp && activeSp !== tailSp);
  if (
    speakerChangedInNf &&
    activeLang &&
    tailLang &&
    tailLang !== activeLang &&
    frameNonFinals.length > 0 &&
    openCommitted.trim().length > 0 &&
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
        nonFinalTokens: nonFinalsForRow(frameNonFinals, rowSpeaker),
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
