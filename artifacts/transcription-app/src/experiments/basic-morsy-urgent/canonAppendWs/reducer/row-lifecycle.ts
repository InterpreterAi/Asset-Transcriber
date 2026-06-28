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

function trimTrailingSubwordTokens(
  tokens: CanonToken[],
  preserveLeadingDigitSubwords: boolean,
): CanonToken[] {
  if (tokens.length === 0) return tokens;
  const last = tokens[tokens.length - 1]!;
  const txt = last.text;
  // Sub-word piece: no leading space, short, no vowel (consonant cluster like "th", "ng", "ck")
  const hasVowel = /[aeiouAEIOU\u0600-\u06FF]/.test(txt);
  const isSubword =
    !txt.startsWith(" ") &&
    txt.length <= 3 &&
    !hasVowel &&
    !/[.!?,]$/.test(txt) &&
    !(preserveLeadingDigitSubwords && /^\d/.test(txt));
  if (isSubword) return trimTrailingSubwordTokens(tokens.slice(0, -1), preserveLeadingDigitSubwords);
  return tokens;
}

/** New row when a final token's speaker or language differs from the active row. */
export function rowBreaksOnFinalToken(
  row: CanonUtterance,
  tok: CanonToken,
  opts: { ignoreLanguageMismatch?: boolean } = {},
): boolean {
  if (!row.finalTokens.length) return false;
  const rsp = norm(row.speaker);
  const rlg = langBase(row.language);
  const tsp = norm(tok.speaker);
  const tlg = langBase(tok.language);
  if (rsp && tsp && rsp !== tsp) return true;
  if (opts.ignoreLanguageMismatch) return false;
  if (rlg && tlg && rlg !== tlg) return true;
  return false;
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
export function freezeActiveUtterance(
  state: EngineState,
  opts: { preserveLeadingDigitSubwords?: boolean } = {},
): EngineState {
  const au = state.activeUtterance;
  if (!au) return state;
  if (!utteranceCommittedText(au).length && !utteranceLiveText(au).length) {
    return { ...state, activeUtterance: null };
  }
  const frozen: CanonUtterance = {
    ...au,
    finalTokens: trimTrailingSubwordTokens(
      [...au.finalTokens],
      Boolean(opts.preserveLeadingDigitSubwords),
    ),
    nonFinalTokens: [],
    is_final: true,
  };
  return {
    ...state,
    finalizedUtterances: [...state.finalizedUtterances, frozen],
    activeUtterance: null,
    metrics: { ...state.metrics, rowsFrozen: state.metrics.rowsFrozen + 1 },
  };
}

export function applyManualStructuralFreeze(
  state: EngineState,
  opts: { preserveLeadingDigitSubwords?: boolean } = {},
): EngineState {
  return freezeActiveUtterance(state, opts);
}

export const freezeUtteranceWithReconcile = applyManualStructuralFreeze;
export const applyManualFinalizeTail = applyManualStructuralFreeze;
