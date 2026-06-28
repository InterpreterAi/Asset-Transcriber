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

export type TranscriptProjectionOptions = {
  morsyCleanMtNumberPunctuation?: boolean;
};

function stripTrailingPartialFragment(text: string): string {
  let t = text.trimEnd();
  // ONLY strip pure consonant sub-word fragments (no vowels, no digits)
  // These are dangling pieces from speaker-switch freeze mid-word: "th", "nd", "ck"
  t = t.replace(/(?<=[a-zA-Z\u0600-\u06FF])[bcdfghjklmnpqrstvwxyz]{1,3}$/i, "");
  // Strip trailing bare apostrophe
  t = t.replace(/'$/, "");
  return t.trim();
}

function cleanSonioxPunctuation(
  text: string,
): string {
  let t = text;
  // 1. Decimals and numbers: "0. 7. 5" → "0.75", "14,782. 63" → "14,782.63"
  //    Run twice so "0. 7. 5" → "0.7. 5" → "0.7.5" in two passes
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2");
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2");
  //    Collapse double-decimal artifact "0.7.5" → "0.75"
  t = t.replace(/(\d)\.(\d)\.(\d+)/g, "$1.$2$3");
  // 2. Phone prefix: "+. 1" → "+1"
  t = t.replace(/\+\.\s*/g, "+");
  // 3. Possessives: "Today.'s" → "Today's" (straight and curly apostrophe)
  t = t.replace(/\.(?=[\u2019\u0027]s\b)/g, "");
  // 4. Uppercase code sequences: "N. VM" → "NVM", "NVM-4. 4307" → "NVM-44307"
  t = t.replace(/\b([A-Z])\.\s+([A-Z])/g, "$1$2");
  t = t.replace(/([A-Z]{2,}-\d+)\.\s*(\d)/g, "$1$2");
  // 5. Period before lowercase → remove (Soniox false sentence boundary)
  t = t.replace(/\.\s*([a-z\u0600-\u06FF])/g, " $1");
  // 6. Lowercase-period-space-lowercase → remove period
  t = t.replace(/([a-z])\.\s+([a-z])/g, "$1 $2");
  // 7. Mid-sentence capitalized word after period → remove period
  //    Soniox bakes period into token then capitalizes next word at pauses
  const MID = [
    "And","Or","But","With","Is","Are","Was","Were","Has","Have","Had",
    "Do","Does","Did","At","In","On","Of","To","For","By","So","Yet",
    "Not","Being","About","From","Into","Then","When","That","Which",
    "What","Who","How","If","As","Just","Now","Any","The","A","An",
    "His","Her","Him","Its","Our","Their","Your","My","He","She","It",
    "We","They","You","Can","Could","Will","Would","Should","May","Might","Also",
  ];
  const midPat = new RegExp(`\\b(${MID.join("|")})\\.\\s`, "g");
  t = t.replace(midPat, "$1 ");
  // 8. Clean stacked punctuation
  t = t.replace(/[,]{2,}/g, ",");
  t = t.replace(/[.]{2,}/g, ".");
  t = t.replace(/[,.][,.]+/g, ".");
  t = t.replace(/,\s*\./g, ".");
  t = t.replace(/,\s*$/g, "");
  return t.trim();
}

function utteranceRow(
  u: CanonUtterance,
  finalized: boolean,
  opts: TranscriptProjectionOptions,
): RowProjection | null {
  const rawCommitted = utteranceCommittedText(u);
  const committedText = finalized
    ? opts.morsyCleanMtNumberPunctuation
      ? cleanSonioxPunctuation(stripTrailingPartialFragment(rawCommitted))
      : rawCommitted
    : rawCommitted;
  if (/^[\s.,!?;:—–\-"'()[\]{}]+$/.test(committedText)) return null;
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
export function projectTranscriptView(
  state: EngineState,
  opts: TranscriptProjectionOptions = {},
): TranscriptProjection {
  const rows: RowProjection[] = [];

  for (const fu of state.finalizedUtterances) {
    const pr = utteranceRow(fu, true, opts);
    if (pr) rows.push(pr);
  }

  if (state.activeUtterance) {
    const pr = utteranceRow(state.activeUtterance, false, opts);
    if (pr) rows.push(pr);
  }

  const liveCombined = rows.map(rr => rr.committedText + rr.liveText).join("\n");
  return { rows, liveCombined };
}
