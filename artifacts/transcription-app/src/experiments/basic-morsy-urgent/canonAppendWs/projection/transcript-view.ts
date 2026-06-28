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
  t = t.replace(/(?<=[a-zA-Z\u0600-\u06FF])[bcdfghjklmnpqrstvwxyz']{1,3}$/, "");
  t = t.replace(/'$/, "");
  t = t.replace(/\s[b-df-hj-np-tv-z]$/, "");
  t = t.replace(/\s[b-df-hj-np-tv-z]{2}$/, "");
  return t.trim();
}

function cleanSonioxPunctuation(
  text: string,
): string {
  let t = text;
  // 1. Spoken word "dash" / "guión" between alphanumerics → hyphen character
  t = t.replace(/([A-Za-z0-9])\s+[Dd]ash\s+([A-Za-z0-9])/g, "$1-$2");
  t = t.replace(/([A-Za-z0-9])\s+[Gg]ui[oó]n\s+([A-Za-z0-9])/g, "$1-$2");
  // 2. Possessives: "Today.'s" → "Today's"
  t = t.replace(/\.(?=['']s\b)/g, "");
  // 3. Uppercase code joining — BEFORE decimal fix
  // "N. V. M" → "NVM"
  t = t.replace(/\b([A-Z])\.\s+([A-Z])/g, "$1$2");
  t = t.replace(/\b([A-Z])\.\s+([A-Z])/g, "$1$2");
  // "NVM-4. 4307-A" → "NVM-44307-A" (digit inside dashed ID)
  t = t.replace(/([A-Z]{2,}-\d+)\.\s*(\d)/g, "$1$2");
  // "A. 59372" or "X. 719" → "A59372", "X719"
  t = t.replace(/\b([A-Z])\.\s+(\d)/g, "$1$2");
  // 4. Decimals: "0. 7. 5" → "0.75", "$14,782. 63" → "$14,782.63"
  // "0. 7. 5" → "0.75", "$14,782. 63" → "$14,782.63"
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2");
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2");
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2");
  // Collapse double-decimal: "0.7.5" → "0.75"
  t = t.replace(/(\d)\.(\d)\.(\d+)/g, "$1.$2$3");
  // 5. Phone prefix: "+. 1" → "+1"
  t = t.replace(/\+\.\s*/g, "+");
  // 6. Space after dash in IDs: "A- 9372-B" → "A-9372-B"
  t = t.replace(/([A-Z0-9])-\s+(\d)/g, "$1-$2");
  t = t.replace(/([A-Z0-9])-\s+([A-Z])/g, "$1-$2");
  // 7. Email space fix: "secure ops@" → "secureops@"
  t = t.replace(/([a-zA-Z0-9])\s+([a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+)/g, "$1$2");
  // 8. Period before lowercase → space (Soniox false sentence boundary)
  t = t.replace(/\.\s*([a-z\u00e0-\u024f\u0600-\u06FF])/g, " $1");
  t = t.replace(/([a-z])\.\s+([a-z])/g, "$1 $2");
  // 9. Mid-sentence words — remove false period (these cannot end a sentence)
  const MID = [
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
  // 10. Clean stacked punctuation + normalize spaces
  t = t.replace(/[,]{2,}/g, ",");
  t = t.replace(/[.]{2,}/g, ".");
  t = t.replace(/[,.][,.]+/g, ".");
  t = t.replace(/,\s*\./g, ".");
  t = t.replace(/,\s*$/g, "");
  t = t.replace(/\s{2,}/g, " ");
  return t.trim();
}

function utteranceRow(
  u: CanonUtterance,
  finalized: boolean,
  opts: TranscriptProjectionOptions,
): RowProjection | null {
  const rawCommitted = utteranceCommittedText(u);
  const cleanMt = Boolean(opts.morsyCleanMtNumberPunctuation);
  const committedText = finalized
    ? cleanMt
      ? cleanSonioxPunctuation(stripTrailingPartialFragment(rawCommitted))
      : rawCommitted
    : cleanMt
      ? cleanSonioxPunctuation(rawCommitted)
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
