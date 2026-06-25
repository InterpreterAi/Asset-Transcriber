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
  let t = text.trimEnd();
  // Strip trailing sub-word token: a token that has no leading space and is ≤4 chars
  // with no vowel — it's a sub-word continuation piece (e.g. "th", "nd", "ck", "ng")
  // that got stranded when the row froze mid-word.
  // We detect it by checking if the text ends with a short no-space fragment.
  t = t.replace(/(?<=[a-zA-Z\u0600-\u06FF])[bcdfghjklmnpqrstvwxyz']{1,3}$/, "");
  // Also strip trailing apostrophe fragments: "You'" → "You"
  t = t.replace(/'$/, "");
  // Single consonant after space: " b", " th"
  t = t.replace(/\s[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]$/, "");
  // 2-consonant cluster: " wh", " fr"
  t = t.replace(/\s[b-df-hj-np-tv-z]{2}$/i, "");
  // Common Spanish/English partial stems with vowels (3-6 chars, no word ending pattern)
  // Matches fragments like "escuch", "eith", "unfortun", "acord" that end mid-stem
  t = t.replace(/\s[a-záéíóúü]{3,6}$/i, (match) => {
    const word = match.trim().toLowerCase();
    // Preserve real short words — don't strip these
    const KEEP = new Set([
      "han", "hay", "sin", "son", "van", "fue", "era", "una", "uno",
      "los", "las", "del", "que", "con", "por", "the", "and", "for", "not", "but",
      "can", "did", "got", "had", "has", "him", "his", "its", "let", "may", "now",
      "our", "out", "see", "she", "them", "then", "they", "was", "way", "who",
      "yes", "you", "her", "him", "how", "its", "man", "men", "new", "old", "own",
      "say", "two", "use", "day", "get", "big", "few", "run", "too", "any", "are",
    ]);
    return KEEP.has(word) ? match : "";
  });
  return t.trim();
}

function cleanSonioxPunctuation(text: string): string {
  let t = text;
  // Remove period/comma immediately before a lowercase letter: "Any. ear" → "Any ear"
  t = t.replace(/([,.])\s*([a-z\u0600-\u06FF])/g, " $2");
  // Remove period immediately after a lowercase word where next word is also lowercase: "we. check" → "we check"
  t = t.replace(/([a-z])\.\s+([a-z])/g, "$1 $2");
  // Soniox bakes periods into word tokens mid-sentence, then capitalizes the next word.
  // Pattern: "And. With the fever" — "With" is capitalized because Soniox thinks new sentence.
  // Remove period when the word before it is a conjunction, preposition, or auxiliary verb.
  const MID_SENTENCE_WORDS = [
    "And","Or","But","With","Is","Are","Was","Were","Has","Have","Had",
    "Do","Does","Did","At","In","On","Of","To","For","By","So","Yet",
    "Not","Being","About","From","Into","Then","When","That","Which",
    "What","Who","How","If","As","Just","Now","Any","The","A","An",
    "His","Her","Him","Its","Our","Their","Your","My","He","She","It",
    "We","They","You","Can","Could","Will","Would","Should","May","Might","Also",
  ];
  const midWordPattern = new RegExp(
    `\\b(${MID_SENTENCE_WORDS.join("|")})\\.( )`,
    "g"
  );
  t = t.replace(midWordPattern, "$1$2");
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
