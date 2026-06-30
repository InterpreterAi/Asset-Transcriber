import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";

import { SAME_SPEAKER_LONG_PAUSE_SPLIT_MS } from "../policies/segmentation-constants";
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

const SPEAKER_BREAK_CONFIRM_TOKENS = 2;

function normalizedSpeakerId(s?: string): string | undefined {
  const t = s?.trim();
  return t && t.length > 0 ? t : undefined;
}

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
  return {
    ...freezeActiveUtterance(state),
    endpointPending: false,
    endpointPendingAtMs: 0,
  };
}

/**
 * Soniox real-time contract + Intercall row timing:
 * - Append finals once; replace non-finals each frame
 * - New row on speaker/language final boundary
 * - Same speaker: new row only after {@link SAME_SPEAKER_LONG_PAUSE_SPLIT_MS} silence (not per-sentence `<end>`)
 */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  const wallMs = ctx.wallMs;
  const speakerBreakConfirmTokens = SPEAKER_BREAK_CONFIRM_TOKENS;

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

  const canon = canonTokensFromFrame(frame.tokens);
  const frameFinals = canon.filter(t => t.is_final);
  const frameNonFinals = canon.filter(t => !t.is_final);

  for (const ct of frameFinals) {
    if (next.seenFinalTokenIds.includes(ct.token_id)) continue;
    next = { ...next, seenFinalTokenIds: [...next.seenFinalTokenIds, ct.token_id] };
    ctx.ledger.appendFinalCanon(ct);

    if (next.activeUtterance) {
      const langBreak = rowBreaksForLanguage(next.activeUtterance, ct);
      const spkBreak = !langBreak && rowBreaksForSpeaker(next.activeUtterance, ct);
      if (langBreak) {
        next = freezeActiveUtterance(next);
        next = {
          ...next,
          endpointPending: false,
          endpointPendingAtMs: 0,
          speakerChangeConsecutive: 0,
          metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
        };
      } else if (spkBreak) {
        const consecutive = (next.speakerChangeConsecutive ?? 0) + 1;
        if (consecutive >= speakerBreakConfirmTokens) {
          next = freezeActiveUtterance(next);
          next = {
            ...next,
            endpointPending: false,
            endpointPendingAtMs: 0,
            speakerChangeConsecutive: 0,
            metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
          };
        } else {
          next = { ...next, speakerChangeConsecutive: consecutive };
        }
      } else {
        next = { ...next, speakerChangeConsecutive: 0 };
      }
    }

    if (!next.activeUtterance) {
      next = openActiveUtterance(next, ct.speaker, ct.language);
    }

    next = appendFinalToActive(next, ct);
  }

  const tail = inferTailSpeakerLang(canon.length ? canon : frameNonFinals);

  const tailLang = tail.language?.split("-")[0]?.toLowerCase();
  const activeLang = next.activeUtterance?.language;
  if (
    activeLang &&
    tailLang &&
    tailLang !== activeLang &&
    frameNonFinals.length > 0 &&
    utteranceCommittedText(next.activeUtterance!).trim().length > 0
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

/** PCM tick hook — row splits happen on speech resume in {@link reduceCanonAppendWs}, not on idle PCM. */
export function maybeCloseRowAfterEndpointQuiet(state: EngineState, _wallMs: number): EngineState {
  return state;
}
