import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
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

/** Same speaker, speech resumes after a long gap — new row (not every short Soniox `<end>`). */
function tryLongPauseSplit(
  state: EngineState,
  wallMs: number,
  pauseSplitMs: number,
): EngineState {
  const au = state.activeUtterance;
  if (!au || state.lastTokenActivityWallMs <= 0) return state;
  const gap = wallMs - state.lastTokenActivityWallMs;
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
 * - Language / speaker flips open a new row; short acknowledgements
 *   ("ها؟", "Okay.", "Huh?") absorb language flicker but still hand off speakers
 * - Mid-word open rows absorb lang/speaker flicker so "Good mor"/"ning." stay one bubble
 * - Never overwrite established row speaker labels
 */
function reduceChunkV2Restored(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  const wallMs = ctx.wallMs;

  let next: EngineState = state;
  const pauseSplitMs = ctx.sameSpeakerLongPauseSplitMs ?? SAME_SPEAKER_LONG_PAUSE_SPLIT_MS;
  if (frame.tokens.length > 0) {
    next = tryLongPauseSplit(next, wallMs, pauseSplitMs);
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

  const canon = canonTokensFromFrame(frame.tokens, frame.seq);
  const frameFinals = canon.filter(t => t.is_final);
  const frameNonFinals = canon.filter(t => !t.is_final);

  for (const ct of frameFinals) {
    if (next.seenFinalTokenIds.includes(ct.token_id)) continue;
    next = { ...next, seenFinalTokenIds: [...next.seenFinalTokenIds, ct.token_id] };
    ctx.ledger.appendFinalCanon(ct);

    const incomingShort = isChunkV2ShortAcknowledgement(ct.text);
    const openMidWord = next.activeUtterance
      ? isChunkV2OpenRowMidWord(utteranceCommittedText(next.activeUtterance))
      : false;

    if (next.activeUtterance) {
      const langBreak = rowBreaksForLanguage(next.activeUtterance, ct);
      const spkBreak = !langBreak && rowBreaksForSpeaker(next.activeUtterance, ct);
      // Short acks: absorb language flicker into the open row (no "ها؟" / "Okay."
      // bubble storm). Real speaker handoffs still open a new row.
      // Mid-word: never shatter — Soniox subword + tag flicker ("mor"/"ning").
      if (openMidWord && (langBreak || spkBreak)) {
        next = { ...next, speakerChangeConsecutive: 0 };
      } else if (incomingShort && langBreak) {
        next = { ...next, speakerChangeConsecutive: 0 };
      } else if (langBreak) {
        next = freezeActiveUtterance(next);
        next = {
          ...next,
          endpointPending: false,
          endpointPendingAtMs: 0,
          speakerChangeConsecutive: 0,
          metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
        };
      } else if (spkBreak) {
        next = freezeActiveUtterance(next);
        next = {
          ...next,
          endpointPending: false,
          endpointPendingAtMs: 0,
          speakerChangeConsecutive: 0,
          metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
        };
      } else {
        next = { ...next, speakerChangeConsecutive: 0 };
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
  if (
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
