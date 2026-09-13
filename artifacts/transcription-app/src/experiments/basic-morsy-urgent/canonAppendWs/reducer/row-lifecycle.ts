import type { CanonToken } from "../types/canon-token";
import type { CanonUtterance } from "../types/canon-utterance";
import { utteranceCommittedText, utteranceLiveText } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";
import {
  endsWithIncompleteSentenceFragment,
  endsWithSentenceBoundary,
} from "../policies/endpoint-row-close";

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

function langBase(s: string | undefined): string | undefined {
  const n = norm(s);
  return n ? n.split("-")[0]!.toLowerCase() : undefined;
}
function trimTrailingSubwordTokens(tokens: CanonToken[]): CanonToken[] {
  // Keep finalized token stream intact to avoid truncating valid tails
  // (e.g. "sistem" vs "system" convergence during finalization).
  return tokens;
}

/**
 * Language change may open a new bubble.
 * Same diarized speaker mid-monologue: do NOT split on LID alone — that was
 * opening bubbles with no pause while one person kept talking / code-switching.
 * Same speaker may still language-split after a finished sentence boundary.
 */
export function rowBreaksForLanguage(row: CanonUtterance, tok: CanonToken): boolean {
  if (!row.finalTokens.length) return false;
  const rlg = langBase(row.language);
  const tlg = langBase(tok.language);
  if (!(rlg && tlg && rlg !== tlg)) return false;
  const rsp = norm(row.speaker);
  const tsp = norm(tok.speaker);
  if (rsp && tsp && rsp === tsp) {
    const committed = utteranceCommittedText(row);
    if (!endsWithSentenceBoundary(committed)) return false;
    if (endsWithIncompleteSentenceFragment(committed)) return false;
  }
  return true;
}

/** Speaker changed within same language → requires debounce confirmation */
export function rowBreaksForSpeaker(row: CanonUtterance, tok: CanonToken): boolean {
  if (!row.finalTokens.length) return false;
  if (rowBreaksForLanguage(row, tok)) return false;
  const rsp = norm(row.speaker);
  const tsp = norm(tok.speaker);
  return !!(rsp && tsp && rsp !== tsp);
}

export function openActiveUtterance(
  state: EngineState,
  speaker: string | undefined,
  language: string | undefined,
): EngineState {
  const u: CanonUtterance = {
    utterance_id: `utt-${state.nextUtteranceSeq}`,
    finalTokens: [],
    nonFinalTokens: [],
    speaker: norm(speaker),
    language: langBase(language),
    is_final: false,
  };
  return {
    ...state,
    activeUtterance: u,
    nextUtteranceSeq: state.nextUtteranceSeq + 1,
    speakerChangeConsecutive: 0,
    pendingSpeakerId: undefined,
    pendingLanguage: undefined,
    pendingSpeakerFinals: [],
  };
}

export function appendFinalToActive(
  state: EngineState,
  tok: CanonToken,
  opts?: { preserveEstablishedSpeaker?: boolean },
): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;
  // Chunk-v2 integrity: never overwrite a confirmed row speaker/language label.
  // Non-chunk paths keep prior behavior (incoming token may refresh labels).
  const preserve = opts?.preserveEstablishedSpeaker === true;
  const sp = preserve ? (au.speaker ?? norm(tok.speaker)) : (norm(tok.speaker) ?? au.speaker);
  const lg = preserve
    ? (au.language ?? langBase(tok.language))
    : (langBase(tok.language) ?? au.language);
  let start_ms = au.start_ms;
  let end_ms = au.end_ms;
  if (typeof tok.start_ms === "number") {
    start_ms = start_ms === undefined ? tok.start_ms : Math.min(start_ms, tok.start_ms);
  }
  if (typeof tok.end_ms === "number") {
    end_ms = end_ms === undefined ? tok.end_ms : Math.max(end_ms, tok.end_ms);
  }
  return {
    ...state,
    activeUtterance: {
      ...au,
      speaker: sp,
      language: lg,
      start_ms,
      end_ms,
      finalTokens: [...au.finalTokens, tok],
    },
    metrics: { ...state.metrics, finalsAppended: state.metrics.finalsAppended + 1 },
  };
}

/**
 * Force-confirm buffered language/speaker finals onto a new active row.
 * Used by freeze (Stop/pause) and by chunk-v2 N-token break confirmation.
 */
export function confirmPendingBreakToActive(state: EngineState): EngineState {
  const pending = state.pendingSpeakerFinals;
  if (!pending.length) {
    return {
      ...state,
      pendingSpeakerId: undefined,
      pendingLanguage: undefined,
      pendingSpeakerFinals: [],
      speakerChangeConsecutive: 0,
    };
  }
  const first = pending[0]!;
  const speaker = state.pendingSpeakerId ?? first.speaker;
  const language = state.pendingLanguage ?? first.language;
  let next: EngineState = {
    ...state,
    pendingSpeakerId: undefined,
    pendingLanguage: undefined,
    pendingSpeakerFinals: [],
    speakerChangeConsecutive: 0,
  };
  // Freeze the old row without re-entering pending promotion.
  const au = next.activeUtterance;
  if (au && (utteranceCommittedText(au).length > 0 || utteranceLiveText(au).length > 0)) {
    const frozen: CanonUtterance = {
      ...au,
      finalTokens: trimTrailingSubwordTokens([...au.finalTokens]),
      nonFinalTokens: [],
      is_final: true,
      translationText: next.activeTranslationText?.trim() || undefined,
    };
    next = {
      ...next,
      finalizedUtterances: [...next.finalizedUtterances, frozen],
      activeUtterance: null,
      activeTranslationText: "",
      activeTranslationPreviewText: "",
      metrics: {
        ...next.metrics,
        rowsFrozen: next.metrics.rowsFrozen + 1,
        speakerFlipCount: next.metrics.speakerFlipCount + 1,
      },
    };
  } else {
    next = { ...next, activeUtterance: null };
  }
  next = openActiveUtterance(next, speaker, language);
  for (const tok of pending) {
    next = appendFinalToActive(next, tok, { preserveEstablishedSpeaker: true });
  }
  return next;
}

/** Hard-close active row — Intercall-style immutable block. */
export function freezeActiveUtterance(state: EngineState): EngineState {
  // If a chunk-v2 debounce is holding finals off-row, promote them onto a new
  // active row first so Stop / pause-split do not drop the handoff.
  let next = confirmPendingBreakToActive(state);
  const au = next.activeUtterance;
  if (!au) return next;
  if (!utteranceCommittedText(au).length && !utteranceLiveText(au).length) {
    return { ...next, activeUtterance: null };
  }
  const frozen: CanonUtterance = {
    ...au,
    finalTokens: trimTrailingSubwordTokens([...au.finalTokens]),
    nonFinalTokens: [],
    is_final: true,
    translationText: next.activeTranslationText?.trim() || undefined,
  };
  return {
    ...next,
    finalizedUtterances: [...next.finalizedUtterances, frozen],
    activeUtterance: null,
    activeTranslationText: "",
    activeTranslationPreviewText: "",
    speakerChangeConsecutive: 0,
    pendingSpeakerId: undefined,
    pendingLanguage: undefined,
    pendingSpeakerFinals: [],
    metrics: { ...next.metrics, rowsFrozen: next.metrics.rowsFrozen + 1 },
  };
}

export const applyManualStructuralFreeze = freezeActiveUtterance;

export const freezeUtteranceWithReconcile = freezeActiveUtterance;
export const applyManualFinalizeTail = freezeActiveUtterance;
