import { joinCanonText } from "../types/canon-token";
import type { CanonUtterance } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

import { rollupSegmentsToTokens, syncCanonUtteranceRollup } from "./utterance-rollup";

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

function canonUtteranceToProjectionRow(u: CanonUtterance): RowProjection | null {
  const synced = syncCanonUtteranceRollup(u);
  const { committed, live } = rollupSegmentsToTokens(synced.segments);

  const committedText = joinCanonText(committed);
  const liveText = u.is_final ? "" : joinCanonText(live);
  if (!committedText.length && !liveText.length) return null;

  return {
    row_id: u.utterance_id,
    speaker: synced.speaker,
    language: synced.language,
    committedText,
    liveText,
    finalized: Boolean(u.is_final),
  };
}

/** Project engine state → one UI row per finalized conversational utterance + one fused active utterance. */
export function projectTranscriptView(state: EngineState): TranscriptProjection {
  const rows: RowProjection[] = [];

  for (const fu of state.finalizedUtterances) {
    const pr = canonUtteranceToProjectionRow(fu);
    if (pr) rows.push(pr);
  }

  if (state.activeUtterance) {
    const ar = canonUtteranceToProjectionRow(state.activeUtterance);
    if (ar) rows.push(ar);
  }

  const liveCombined = rows.map(rr => rr.committedText + rr.liveText).join("\n");
  return { rows, liveCombined };
}
