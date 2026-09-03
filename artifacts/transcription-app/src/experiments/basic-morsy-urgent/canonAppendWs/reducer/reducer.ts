import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { EngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";

import { SAME_SPEAKER_LONG_PAUSE_SPLIT_MS } from "../policies/segmentation-constants";
import {
  repairSpokenEmailTranslation,
  shouldHoldSpelledAlphanumericRow,
} from "../policies/spelled-alphanumeric";
import {
  appendFinalToActive,
  freezeActiveUtterance,
  openActiveUtterance,
  rowBreaksForLanguage,
  rowBreaksForSpeaker,
} from "./row-lifecycle";
import type { CanonToken } from "../types/canon-token";
import { utteranceCommittedText, utteranceLiveText } from "../types/canon-utterance";
import {
  canonTokensFromFrame,
  translationPreviewTextFromFrame,
  translationTextFromFrame,
  inferTailSpeakerLang,
  nonFinalsForRow,
  stabilizeCanonSpeakers,
} from "./soniox-frame-split";

/** Two consecutive new-speaker finals confirm a handoff. First token stays off the old row. */
const SPEAKER_BREAK_CONFIRM_TOKENS = 2;
/** New-speaker live text this long opens the next colored row immediately (no paint on the old row). */
const SUBSTANTIAL_NEW_SPEAKER_NF_CHARS = 8;
const SUBSTANTIAL_NEW_SPEAKER_NF_TOKENS = 2;

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

function freezeRowForSonioxNative(state: EngineState, chunkV2NativeTranslate: boolean): EngineState {
  const cleared: EngineState = {
    ...state,
    pendingSpeakerId: undefined,
    pendingSpeakerFinals: [],
  };
  if (!chunkV2NativeTranslate || !cleared.activeUtterance) {
    return freezeActiveUtterance(cleared);
  }
  const source = utteranceCommittedText(cleared.activeUtterance);
  const repaired = repairSpokenEmailTranslation(source, cleared.activeTranslationText ?? "");
  return freezeActiveUtterance({
    ...cleared,
    activeTranslationText: repaired,
  });
}

function handoffToSpeaker(
  state: EngineState,
  speaker: string | undefined,
  language: string | undefined,
  startFinals: CanonToken[],
  nativeTranslate: boolean,
): EngineState {
  let next = freezeRowForSonioxNative(state, nativeTranslate);
  next = {
    ...next,
    endpointPending: false,
    endpointPendingAtMs: 0,
    speakerChangeConsecutive: 0,
    metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
  };
  next = openActiveUtterance(next, speaker, language);
  for (const tok of startFinals) {
    next = appendFinalToActive(next, tok);
  }
  return next;
}

function absorbPendingIntoActive(state: EngineState): EngineState {
  const pending = state.pendingSpeakerFinals;
  const au = state.activeUtterance;
  if (!pending.length || !au) {
    return {
      ...state,
      pendingSpeakerId: undefined,
      pendingSpeakerFinals: [],
      speakerChangeConsecutive: 0,
    };
  }
  let next: EngineState = {
    ...state,
    pendingSpeakerId: undefined,
    pendingSpeakerFinals: [],
    speakerChangeConsecutive: 0,
  };
  for (const tok of pending) {
    next = appendFinalToActive(next, {
      ...tok,
      speaker: au.speaker,
      language: au.language ?? tok.language,
    });
  }
  return next;
}

function incomingCanonPreview(frame: SonioxFrame): string {
  return frame.tokens
    .filter(t => {
      if (t.translation_status === "translation") return false;
      if (typeof t.text !== "string") return false;
      const n = t.text.trim().toLowerCase();
      return n.length > 0 && n !== "<end>" && n !== "<eos>" && n !== "<eps>";
    })
    .map(t => t.text)
    .join("")
    .trim();
}

/** Same speaker, speech resumes after a long gap — new row (not every short Soniox `<end>`). */
function tryLongPauseSplit(
  state: EngineState,
  wallMs: number,
  pauseSplitMs: number,
  incomingText: string,
  chunkV2NativeTranslate: boolean,
): EngineState {
  const au = state.activeUtterance;
  if (!au || state.lastTokenActivityWallMs <= 0) return state;
  const gap = wallMs - state.lastTokenActivityWallMs;
  if (gap < pauseSplitMs) return state;
  const hasContent =
    utteranceCommittedText(au).trim().length > 0 || utteranceLiveText(au).trim().length > 0;
  if (!hasContent) return state;
  if (
    chunkV2NativeTranslate &&
    shouldHoldSpelledAlphanumericRow(utteranceCommittedText(au), incomingText)
  ) {
    return state;
  }
  return {
    ...freezeRowForSonioxNative(state, chunkV2NativeTranslate),
    endpointPending: false,
    endpointPendingAtMs: 0,
  };
}

/**
 * Soniox real-time contract + Intercall row timing:
 * - Append finals once; replace non-finals each frame
 * - New colored row only on a real speaker handoff (never on language flicker)
 * - Same speaker: new row only after {@link SAME_SPEAKER_LONG_PAUSE_SPLIT_MS} silence (not per-sentence `<end>`)
 */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  const wallMs = ctx.wallMs;
  const speakerBreakConfirmTokens = SPEAKER_BREAK_CONFIRM_TOKENS;

  let next: EngineState = state;
  const pauseSplitMs = ctx.sameSpeakerLongPauseSplitMs ?? SAME_SPEAKER_LONG_PAUSE_SPLIT_MS;
  const nativeTranslate = ctx.chunkV2NativeTranslate === true;
  if (frame.tokens.length > 0) {
    next = tryLongPauseSplit(
      next,
      wallMs,
      pauseSplitMs,
      incomingCanonPreview(frame),
      nativeTranslate,
    );
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

  const canon = stabilizeCanonSpeakers(canonTokensFromFrame(frame.tokens));
  const frameFinals = canon.filter(t => t.is_final);
  const frameNonFinals = canon.filter(t => !t.is_final);

  for (const ct of frameFinals) {
    if (next.seenFinalTokenIds.includes(ct.token_id)) continue;
    next = { ...next, seenFinalTokenIds: [...next.seenFinalTokenIds, ct.token_id] };
    ctx.ledger.appendFinalCanon(ct);

    if (next.activeUtterance) {
      const langBreak = rowBreaksForLanguage(next.activeUtterance, ct);
      const spkBreak = rowBreaksForSpeaker(next.activeUtterance, ct);
      const holdSpelling =
        nativeTranslate &&
        shouldHoldSpelledAlphanumericRow(utteranceCommittedText(next.activeUtterance), ct.text);
      if (holdSpelling && (spkBreak || langBreak)) {
        next = {
          ...next,
          speakerChangeConsecutive: 0,
          pendingSpeakerId: undefined,
          pendingSpeakerFinals: [],
        };
      } else if (spkBreak) {
        // Buffer off the old row. Confirm on the 2nd final — never paint, then rip.
        const sid = normalizedSpeakerId(ct.speaker);
        if (sid && next.pendingSpeakerId === sid) {
          const consecutive = (next.speakerChangeConsecutive ?? 0) + 1;
          if (consecutive >= speakerBreakConfirmTokens) {
            next = handoffToSpeaker(
              next,
              ct.speaker,
              ct.language,
              [...next.pendingSpeakerFinals, ct],
              nativeTranslate,
            );
            continue;
          }
          next = {
            ...next,
            speakerChangeConsecutive: consecutive,
            pendingSpeakerFinals: [...next.pendingSpeakerFinals, ct],
          };
          continue;
        }
        next = {
          ...next,
          speakerChangeConsecutive: 1,
          pendingSpeakerId: sid,
          pendingSpeakerFinals: [ct],
        };
        continue;
      } else if (next.pendingSpeakerFinals.length) {
        next = absorbPendingIntoActive(next);
      } else {
        next = { ...next, speakerChangeConsecutive: 0 };
      }
    }

    if (!next.activeUtterance) {
      next = openActiveUtterance(next, ct.speaker, ct.language);
    }

    const holdSpellingAppend =
      nativeTranslate &&
      !!next.activeUtterance &&
      shouldHoldSpelledAlphanumericRow(utteranceCommittedText(next.activeUtterance), ct.text) &&
      (rowBreaksForSpeaker(next.activeUtterance, ct) ||
        rowBreaksForLanguage(next.activeUtterance, ct)) &&
      !!next.activeUtterance.speaker;
    const appendTok = holdSpellingAppend
      ? {
          ...ct,
          speaker: next.activeUtterance!.speaker,
          language: next.activeUtterance!.language ?? ct.language,
        }
      : ct;
    next = appendFinalToActive(next, appendTok);
  }

  const tail = inferTailSpeakerLang(canon.length ? canon : frameNonFinals);
  const activeSpeaker = normalizedSpeakerId(next.activeUtterance?.speaker);
  const nfNewSpeaker = frameNonFinals.filter(t => {
    const s = normalizedSpeakerId(t.speaker);
    return !!s && !!activeSpeaker && s !== activeSpeaker;
  });
  const nfNewChars = nfNewSpeaker.map(t => t.text).join("").trim().length;
  const substantialNewSpeakerNf =
    nfNewSpeaker.length >= SUBSTANTIAL_NEW_SPEAKER_NF_TOKENS ||
    nfNewChars >= SUBSTANTIAL_NEW_SPEAKER_NF_CHARS;
  if (
    next.activeUtterance &&
    substantialNewSpeakerNf &&
    utteranceCommittedText(next.activeUtterance).trim().length > 0
  ) {
    const newSid =
      normalizedSpeakerId(nfNewSpeaker[nfNewSpeaker.length - 1]?.speaker) ??
      normalizedSpeakerId(tail.speaker);
    const pendingForNew =
      newSid && next.pendingSpeakerId === newSid ? next.pendingSpeakerFinals : [];
    next = handoffToSpeaker(
      next,
      newSid,
      tail.language,
      pendingForNew,
      nativeTranslate,
    );
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
