import type { CanonToken } from "../types/canon-token";
import type { CanonUtterance } from "../types/canon-utterance";
import { utteranceCommittedText, utteranceLiveText } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

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

/** Language changed → always split immediately */
export function rowBreaksForLanguage(row: CanonUtterance, tok: CanonToken): boolean {
  if (!row.finalTokens.length) return false;
  const rlg = langBase(row.language);
  const tlg = langBase(tok.language);
  return !!(rlg && tlg && rlg !== tlg);
}

/**
 * Speaker changed — evaluated independently of language now (reducer combines
 * this with `rowBreaksForLanguage` itself to distinguish a genuine handoff
 * from a same-speaker language code-switch).
 */
export function rowBreaksForSpeaker(row: CanonUtterance, tok: CanonToken): boolean {
  if (!row.finalTokens.length) return false;
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
  };
}

export function appendFinalToActive(state: EngineState, tok: CanonToken): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;
  const sp = norm(tok.speaker) ?? au.speaker;
  const lg = langBase(tok.language) ?? au.language;
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

/** Hard-close active row — Intercall-style immutable block. */
export function freezeActiveUtterance(state: EngineState): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;
  if (!utteranceCommittedText(au).length && !utteranceLiveText(au).length) {
    return { ...state, activeUtterance: null };
  }
  const frozen: CanonUtterance = {
    ...au,
    finalTokens: trimTrailingSubwordTokens([...au.finalTokens]),
    nonFinalTokens: [],
    is_final: true,
    translationText: state.activeTranslationText?.trim() || undefined,
  };
  return {
    ...state,
    finalizedUtterances: [...state.finalizedUtterances, frozen],
    activeUtterance: null,
    activeTranslationText: "",
    activeTranslationPreviewText: "",
    speakerChangeConsecutive: 0,
    metrics: { ...state.metrics, rowsFrozen: state.metrics.rowsFrozen + 1 },
  };
}

export const applyManualStructuralFreeze = freezeActiveUtterance;

export const freezeUtteranceWithReconcile = freezeActiveUtterance;
export const applyManualFinalizeTail = freezeActiveUtterance;
