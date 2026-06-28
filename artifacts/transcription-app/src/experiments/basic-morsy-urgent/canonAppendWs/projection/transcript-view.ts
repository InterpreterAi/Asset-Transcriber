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
  // Strip trailing consonant sub-word fragment glued to the previous character
  // (no leading space, ≤3 chars, lowercase consonants only — e.g. "conditi" + "on" frozen)
  t = t.replace(/(?<=[a-zA-Z\u0600-\u06FF])[bcdfghjklmnpqrstvwxyz']{1,3}$/, "");
  // Strip trailing bare apostrophe
  t = t.replace(/'$/, "");
  // Strip single isolated lowercase consonant after space: " b", " k" — sub-word onset
  t = t.replace(/\s[b-df-hj-np-tv-z]$/, "");
  // Strip 2-lowercase-consonant cluster after space: " wh", " fr"
  t = t.replace(/\s[b-df-hj-np-tv-z]{2}$/, "");
  // ⚠️ Do NOT strip 3-6 letter words — false positives on codes like NVM, RX, XR, etc.
  return t.trim();
}

function cleanSonioxPunctuation(
  text: string,
): string {
  let t = text;
  // 1. POSSESSIVES
  // "Today.'s" → "Today's" (straight and curly apostrophe)
  t = t.replace(/\.(?=['']s\b)/g, "");
  // 2. ID CODE JOINING — must run BEFORE decimal fix to avoid "4. 4307" → "4.4307"
  // "N. VM" → "NVM" — uppercase letter · period · uppercase letter
  t = t.replace(/\b([A-Z])\.\s+([A-Z])/g, "$1$2");
  t = t.replace(/\b([A-Z])\.\s+([A-Z])/g, "$1$2"); // second pass for "N. V. M" chains
  // "NVM-4. 4307-A" → "NVM-44307-A" — digit in an alphanumeric-dash ID
  t = t.replace(/([A-Z]{2,}-\d+)\.\s*(\d)/g, "$1$2");
  // "A. 59372" → "A59372" — single uppercase letter · period · digit
  t = t.replace(/\b([A-Z])\.\s+(\d)/g, "$1$2");
  // 3. DECIMALS AND NUMBERS
  // "0. 7. 5" → "0.75", "$14,782. 63" → "$14,782.63"
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2");
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2"); // second pass
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2"); // third pass for long chains
  // Collapse double-decimal: "0.7.5" → "0.75"
  t = t.replace(/(\d)\.(\d)\.(\d+)/g, "$1.$2$3");
  // 4. PHONE PREFIX
  // "+. 1" → "+1"
  t = t.replace(/\+\.\s*/g, "+");
  // 5. SPACE AFTER DASH IN IDs
  // "A- 9372-B" → "A-9372-B"
  t = t.replace(/([A-Z0-9])-\s+(\d)/g, "$1-$2");
  t = t.replace(/([A-Z0-9])-\s+([A-Z])/g, "$1-$2");
  // 6. EMAIL SPACE FIX
  // "secure ops@northvalley..." → "secureops@northvalley..."
  t = t.replace(/([a-zA-Z0-9])\s+([a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+)/g, "$1$2");
  // 7. PERIOD BEFORE LOWERCASE → SPACE
  // Soniox false sentence boundary: "Any. ear" → "Any ear"
  t = t.replace(/\.\s*([a-z\u00e0-\u024f\u0600-\u06FF])/g, " $1");
  t = t.replace(/([a-z])\.\s+([a-z])/g, "$1 $2");
  // 8. MID-SENTENCE WORDS — remove false period after them
  // These words CANNOT legitimately end a sentence, so any trailing period is a Soniox artifact
  const MID = [
    // English
    "And","Or","But","With","Is","Are","Was","Were","Has","Have","Had",
    "Do","Does","Did","At","In","On","Of","To","For","By","So","Yet",
    "Not","Being","About","From","Into","Then","When","That","Which",
    "What","Who","How","If","As","Just","Now","Any","The","A","An",
    "His","Her","Him","Its","Our","Their","Your","My","He","She","It",
    "We","They","You","Can","Could","Will","Would","Should","May","Might","Also",
    // Spanish
    "Y","O","Pero","Con","Es","Son","Fue","Era","Han","Hay",
    "Al","En","De","Del","Los","Las","Le","La","El","Un","Una",
    "No","También","Según","Que","Como","Cuando","Si","Ya","Más",
  ];
  const midPat = new RegExp(`\\b(${MID.join("|")})\\.\\s+`, "g");
  t = t.replace(midPat, "$1 ");
  // 9. CLEAN STACKED PUNCTUATION
  t = t.replace(/[,]{2,}/g, ",");
  t = t.replace(/[.]{2,}/g, ".");
  t = t.replace(/[,.][,.]+/g, ".");
  t = t.replace(/,\s*\./g, ".");
  t = t.replace(/,\s*$/g, "");
  // Normalize multiple spaces to one
  t = t.replace(/\s{2,}/g, " ");
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
