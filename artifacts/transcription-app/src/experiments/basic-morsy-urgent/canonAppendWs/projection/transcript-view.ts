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
  translationText?: string;
};

export type TranscriptProjection = {
  rows: RowProjection[];
  liveCombined: string;
};

export type TranscriptProjectionOptions = {};

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

const PUNCTUATION_ONLY = /^[\s.,!?;:—–\-"'()[\]{}]+$/;

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

/** visible = join(finalTokens) + join(nonFinalTokens) per Soniox docs. */
export function projectTranscriptView(state: EngineState): TranscriptProjection {
  const rows: RowProjection[] = [];

  let groupUtterances: CanonUtterance[] = [];
  let groupSpeaker: string | undefined = undefined;
  let groupLanguage: string | undefined = undefined;

  const flushGroup = () => {
    if (!groupUtterances.length) return;
    const rawJoined = groupUtterances.map(u => utteranceCommittedText(u)).join(" ");
    const committedText = cleanSonioxPunctuation(
      stripTrailingPartialFragment(rawJoined),
    ).replace(/[.,]\s*$/, "");
    if (committedText.length && !PUNCTUATION_ONLY.test(committedText)) {
      const translationJoined = groupUtterances
        .map(u => u.translationText ?? "")
        .join(" ")
        .trim();
      const last = groupUtterances[groupUtterances.length - 1]!;
      rows.push({
        row_id: last.utterance_id,
        speaker: groupSpeaker,
        language: groupLanguage,
        committedText,
        liveText: "",
        finalized: true,
        translationText: translationJoined || undefined,
      });
    }
    groupUtterances = [];
  };

  for (const fu of state.finalizedUtterances) {
    const sp = norm(fu.speaker);
    const lg = fu.language?.split("-")[0]?.toLowerCase();
    if (sp !== groupSpeaker || lg !== groupLanguage) {
      flushGroup();
      groupSpeaker = sp;
      groupLanguage = lg;
    }
    groupUtterances.push(fu);
  }
  flushGroup();

  if (state.activeUtterance) {
    const rawCommitted = utteranceCommittedText(state.activeUtterance);
    const liveText = utteranceLiveText(state.activeUtterance);
    const committedText = cleanSonioxPunctuation(rawCommitted);
    if (committedText.trim().length || liveText.trim().length) {
      rows.push({
        row_id: state.activeUtterance.utterance_id,
        speaker: state.activeUtterance.speaker,
        language: state.activeUtterance.language,
        committedText,
        liveText,
        finalized: false,
        translationText: (state.activeTranslationText ?? "").trim() || undefined,
      });
    }
  }

  const liveCombined = rows.map(rr => rr.committedText + rr.liveText).join("\n");
  return { rows, liveCombined };
}
