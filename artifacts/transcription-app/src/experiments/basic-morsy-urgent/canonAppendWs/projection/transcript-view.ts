import type { CanonUtterance } from "../types/canon-utterance";
import { utteranceCommittedText, utteranceLiveText } from "../types/canon-utterance";
import type { EngineState } from "../types/transcript";

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

function utteranceRow(u: CanonUtterance, finalized: boolean): RowProjection | null {
  const committedText = utteranceCommittedText(u);
  const liveText = finalized ? "" : utteranceLiveText(u);
  if (!committedText.length && !liveText.length) return null;
  return {
    row_id: u.utterance_id,
    speaker: u.speaker,
    language: u.language,
    committedText,
    liveText,
    finalized,
  };
}

/** visible = join(finalTokens) + join(nonFinalTokens) per Soniox docs. */
export function projectTranscriptView(state: EngineState): TranscriptProjection {
  const rows: RowProjection[] = [];

  for (const fu of state.finalizedUtterances) {
    const pr = utteranceRow(fu, true);
    if (pr) rows.push(pr);
  }

  if (state.activeUtterance) {
    const pr = utteranceRow(state.activeUtterance, false);
    if (pr) rows.push(pr);
  }

  const liveCombined = rows.map(rr => rr.committedText + rr.liveText).join("\n");
  return { rows, liveCombined };
}
