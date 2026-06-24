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

function stripTrailingPartialFragment(text: string): string {
  // Remove a trailing single consonant letter preceded by a space: "está b" → "está"
  let t = text.trimEnd().replace(/\s[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]$/, "");
  // Remove a trailing 2-consonant cluster preceded by a space: "work wh" → "work"
  t = t.replace(/\s[b-df-hj-np-tv-z]{2}$/i, "");
  return t;
}

function cleanSonioxPunctuation(text: string): string {
  let t = text;
  // Remove period/comma immediately before a lowercase letter: "Any. ear" → "Any ear"
  t = t.replace(/([,.])\s*([a-z\u0600-\u06FF])/g, " $2");
  // Remove period immediately after a lowercase word where next word is also lowercase: "we. check" → "we check"
  t = t.replace(/([a-z])\.\s+([a-z])/g, "$1 $2");
  // Collapse stacked punctuation: ",." ".," ",," ".." → single "."
  t = t.replace(/[,]{2,}/g, ",");
  t = t.replace(/[.]{2,}/g, ".");
  t = t.replace(/[,.][,.]+/g, ".");
  // Remove trailing comma before a period: "today,." → "today."
  t = t.replace(/,\s*\./g, ".");
  // Remove trailing standalone comma at end of utterance
  t = t.replace(/,\s*$/, "");
  return t.trim();
}

function utteranceRow(u: CanonUtterance, finalized: boolean): RowProjection | null {
  const rawCommitted = utteranceCommittedText(u);
  const committedText = finalized
    ? cleanSonioxPunctuation(stripTrailingPartialFragment(rawCommitted))
    : rawCommitted;
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
