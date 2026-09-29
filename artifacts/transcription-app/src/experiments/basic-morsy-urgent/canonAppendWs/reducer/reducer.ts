import type { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import type { Token } from "../types/tokens";
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
  translationTokensFromFrame,
  inferTailSpeakerLang,
  nonFinalsForRow,
} from "./soniox-frame-split";

const SPEAKER_BREAK_CONFIRM_TOKENS = 1;

function normalizedSpeakerId(s?: string): string | undefined {
  const t = s?.trim();
  return t && t.length > 0 ? t : undefined;
}

/** Digits / punctuation carry no spoken language and must not switch the row language. */
function hasLetters(text: string): boolean {
  return /\p{L}/u.test(text);
}

function langBase(code: string | undefined): string | undefined {
  const b = code?.trim().split("-")[0]?.toLowerCase();
  return b && b.length > 0 ? b : undefined;
}

type TranslationTarget = { kind: "active" } | { kind: "finalized"; index: number };

/**
 * Soniox translation tokens trail their originals, so after a language switch the
 * previous row's translation is still arriving. Send each token to the latest row
 * spoken in the other language (active row first), else the active row.
 */
function translationTarget(state: EngineState, transLang: string | undefined): TranslationTarget {
  const lang = langBase(transLang);
  if (!lang) return { kind: "active" };
  const activeLang = langBase(state.activeUtterance?.language);
  if (activeLang && activeLang !== lang) return { kind: "active" };
  for (let i = state.finalizedUtterances.length - 1; i >= 0; i--) {
    const rowLang = langBase(state.finalizedUtterances[i]!.language);
    if (rowLang && rowLang !== lang) return { kind: "finalized", index: i };
  }
  return { kind: "active" };
}

/**
 * Chunk V2: route final translation tokens per row; non-final translation tokens
 * are resent every frame, so only those routed to the active row form its preview.
 */
function routeChunkV2Translations(state: EngineState, tokens: readonly Token[]): EngineState {
  let activeFinal = state.activeTranslationText ?? "";
  let activePreview = "";
  let finalized = state.finalizedUtterances;
  for (const t of tokens) {
    const target = translationTarget({ ...state, finalizedUtterances: finalized }, t.language);
    if (target.kind === "active") {
      if (t.isFinal) activeFinal += t.text;
      else activePreview += t.text;
      continue;
    }
    if (!t.isFinal) continue;
    if (finalized === state.finalizedUtterances) finalized = finalized.slice();
    const row = finalized[target.index]!;
    finalized[target.index] = { ...row, translationText: `${row.translationText ?? ""}${t.text}` };
  }
  return {
    ...state,
    finalizedUtterances: finalized,
    activeTranslationText: activeFinal,
    activeTranslationPreviewText: `${activeFinal}${activePreview}`,
  };
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
 * - Chunk V2: new row on speaker change, language change, or ~5s same-speaker pause
 * - Other stacks: new row on speaker/language final boundary; same speaker after
 *   {@link SAME_SPEAKER_LONG_PAUSE_SPLIT_MS} silence (not per-sentence `<end>`)
 */
export function reduceCanonAppendWs(state: EngineState, frame: SonioxFrame, ctx: ReduceContext): EngineState {
  const wallMs = ctx.wallMs;
  const speakerBreakConfirmTokens = ctx.chunkV2NativeTranslate ? 1 : SPEAKER_BREAK_CONFIRM_TOKENS;
  const chunkV2 = ctx.chunkV2NativeTranslate === true;

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

  if (!chunkV2) {
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
  }

  const canon = canonTokensFromFrame(frame.tokens).map(ct =>
    chunkV2 && !hasLetters(ct.text) ? { ...ct, language: undefined } : ct,
  );
  const frameFinals = canon.filter(t => t.is_final);
  const frameNonFinals = canon.filter(t => !t.is_final);

  for (const ct of frameFinals) {
    if (next.seenFinalTokenIds.includes(ct.token_id)) continue;
    next = { ...next, seenFinalTokenIds: [...next.seenFinalTokenIds, ct.token_id] };
    ctx.ledger.appendFinalCanon(ct);

    if (next.activeUtterance) {
      const langBreak = rowBreaksForLanguage(next.activeUtterance, ct);
      // spkBreak is evaluated independently of langBreak.
      const spkBreak = rowBreaksForSpeaker(next.activeUtterance, ct);
      if (langBreak && spkBreak) {
        // Genuine handoff: different language AND different speaker — hard break.
        next = freezeActiveUtterance(next);
        next = {
          ...next,
          endpointPending: false,
          endpointPendingAtMs: 0,
          speakerChangeConsecutive: 0,
          metrics: { ...next.metrics, speakerFlipCount: next.metrics.speakerFlipCount + 1 },
        };
      } else if (chunkV2 && langBreak) {
        // Chunk V2 only: same speaker, language switched → new bubble.
        next = freezeActiveUtterance(next);
        next = {
          ...next,
          endpointPending: false,
          endpointPendingAtMs: 0,
          speakerChangeConsecutive: 0,
        };
      } else if (spkBreak) {
        // Speaker changed, language stayed the same — use the confirmation debounce.
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
        // Non-chunk-v2 langBreak && !spkBreak: same-speaker code-switch stays on the row.
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

  if (chunkV2) {
    next = routeChunkV2Translations(next, translationTokensFromFrame(frame.tokens));
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
