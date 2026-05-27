import { joinCanonText } from "../types/canon-token";
import type { CanonUtterance } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

import { deriveStructuralOwnership } from "../policies/structural-ownership";

export type RowProjection = {
  row_id: string;
  speaker?: string;
  language?: string;
  committedText: string;
  liveText: string;
  finalized: boolean;
};

export type TranscriptProjection = {
  rows: RowProjection[];
  liveCombined: string;
};

const PAINT_ONLY_ROW_ID = "paint-hypothesis";

function frozenUtteranceRow(u: CanonUtterance): RowProjection | null {
  const committedText = joinCanonText(u.committedTokens);
  if (!committedText.length) return null;
  const own = deriveStructuralOwnership(u.committedTokens);
  return {
    row_id: u.utterance_id,
    speaker: own.speaker ?? u.speaker,
    language: own.language ?? u.language,
    committedText,
    liveText: "",
    finalized: true,
  };
}

function activeStructuralRow(state: EngineState): RowProjection | null {
  const au = state.activeUtterance;
  if (!au) return null;
  const committedText = joinCanonText(au.committedTokens);
  const liveText = joinCanonText(state.paint.tokens);
  if (!committedText.length && !liveText.length) return null;
  const own = deriveStructuralOwnership(au.committedTokens);
  return {
    row_id: au.utterance_id,
    speaker: own.speaker ?? au.speaker,
    language: own.language ?? au.language,
    committedText,
    liveText,
    finalized: false,
  };
}

function paintOnlyRow(state: EngineState): RowProjection | null {
  if (state.activeUtterance) return null;
  const liveText = joinCanonText(state.paint.tokens);
  if (!liveText.length) return null;
  return {
    row_id: PAINT_ONLY_ROW_ID,
    speaker: undefined,
    language: undefined,
    committedText: "",
    liveText,
    finalized: false,
  };
}

/** One active conversational surface + immutable history — paint never creates duplicate structural rows. */
export function projectTranscriptView(state: EngineState): TranscriptProjection {
  const rows: RowProjection[] = [];

  for (const fu of state.finalizedUtterances) {
    const pr = frozenUtteranceRow(fu);
    if (pr) rows.push(pr);
  }

  const active = activeStructuralRow(state) ?? paintOnlyRow(state);
  if (active) rows.push(active);

  const liveCombined = rows.map(rr => rr.committedText + rr.liveText).join("\n");
  return { rows, liveCombined };
}
