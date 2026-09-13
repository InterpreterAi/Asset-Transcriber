/**
 * Display-only repair for Soniox early-finalized sentence periods.
 *
 * Soniox streams tokens and may lock `.` as final mid-phrase (finals never
 * change — see https://soniox.com/docs/stt/rt/real-time-transcription).
 * That is language-agnostic STT behavior; other languages inherit the same
 * broken Original structure in native translation. We repair *rendered* text
 * only — the append-only ledger stays untouched.
 */

/** Words that almost never end a sentence before a continuation. */
const LATIN_MID_CLAUSE =
  "a|an|the|and|or|but|with|is|are|was|were|has|have|had|do|does|did|at|in|on|of|to|for|by|so|yet|not|from|into|then|when|that|which|what|who|how|if|as|just|now|any|his|her|him|its|our|their|your|my|he|she|it|we|they|you|can|could|will|would|should|may|might|also|after|before|during|while|because|although|however|including|these|this|each|all|both|over|under|through|between|within|without|among|against|there|here|where|very|well|soon|later|i|i'm|i've|i'd|i'll|we're|we've|we'd|they're|they've|you're|you've|she's|he's|it's|that's|there's|what's|who's|getting|going|looking|trying|having|being|doing|saying|needing|asking|seeing|letting|y|o|pero|con|es|son|fue|era|al|en|de|del|los|las|le|la|el|un|una|no|que|como|cuando|si|ya|más|mais|ou|et|des|du|une|je|tu|il|elle|nous|vous|ils|elles|und|oder|aber|mit|ist|sind|der|die|das|ein|eine|ich|du|er|sie|wir|ihr";

/**
 * Arabic clause particles that often get a mirrored Latin `.` mid-thought.
 * Does NOT strip periods after full Arabic content words.
 */
const ARABIC_MID_CLAUSE =
  "ثم|هي|هو|أن|إن|من|في|على|إلى|هذا|هذه|كان|كنت|أم|أو|و|ف|ما|لا|نعم|أمم|يعني";

const ABBREV_LEFT = /^(?:dr|mr|mrs|ms|prof|sr|jr|vs|etc|approx|dept|est|inc|ltd|st|ave|rd|no|nos|vol|fig|eq|ed|eds|rev|gen|col|sgt|lt|cmdr|u\.?s|e\.?g|i\.?e)$/i;

function preserveDecimalsAndIds(text: string): string {
  let t = text;
  t = t.replace(/\.(?=['']s\b)/g, "");
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2");
  t = t.replace(/(\d)\.\s+(\d)/g, "$1.$2");
  t = t.replace(/\b([A-Z])\.\s+(\d)/g, "$1$2");
  t = t.replace(/([A-Z]{2,}-\d+)\.\s*(\d)/g, "$1$2");
  t = t.replace(/\+\.\s*/g, "+");
  return t;
}

function finalizeSpacing(original: string, t: string): string {
  const wantTrail = /\s$/.test(original);
  let out = t.replace(/\s{2,}/g, " ").replace(/^\s+/, "");
  if (wantTrail) {
    out = out.replace(/\s+$/, "") + " ";
  } else {
    out = out.replace(/\s+$/, "");
  }
  return out;
}

/**
 * Remove Soniox false sentence boundaries while keeping real ends
 * ("…restroom. Sorry about that.", "Hello. Good morning.").
 */
export function repairChunkV2FalsePeriods(text: string): string {
  if (!text) return text;
  let t = preserveDecimalsAndIds(text);

  // Period immediately before Latin lowercase → not a sentence end.
  // Do NOT apply to Arabic letters — bilingual rows often end EN with `.` then AR.
  t = t.replace(/\.\s*([a-zà-öø-ÿа-яα-ω])/gu, " $1");

  // Mid-clause word + "." + Latin continuation only (never strip before Arabic —
  // bilingual rows often end an EN clause with `.` then AR speech).
  t = t.replace(
    new RegExp(
      `\\b(${LATIN_MID_CLAUSE})\\.(\\s+)([A-Za-zÀ-Öà-öØ-öø-ÿ][A-Za-zÀ-Öà-öØ-öø-ÿ''-]*)`,
      "giu",
    ),
    (_m, word: string, sp: string, next: string) => {
      const nextOut = /^(?:A|An|The)$/i.test(next) ? next.toLowerCase() : next;
      return `${word}${sp}${nextOut}`;
    },
  );

  // Contractions / progressive left + "." + Capital continuation (she's. Almost).
  t = t.replace(
    /\b((?:she|he|it|that|there|what|who|they|we|you|I)(?:'s|'re|'ve|'ll|'d)|(?:getting|going|looking|trying|having|being|doing|saying|needing|asking|seeing|letting))\.\s+([A-ZÀ-Ö][A-Za-z''-]*)/giu,
    (_m, left: string, right: string) => {
      const bare = String(left).replace(/[''].*$/, "");
      if (ABBREV_LEFT.test(bare)) return `${left}. ${right}`;
      const rightOut = /^(?:A|An|The)$/.test(right) ? right.toLowerCase() : right;
      return `${left} ${rightOut}`;
    },
  );

  // Arabic mid-clause + Latin period (translation mirror of broken EN).
  t = t.replace(new RegExp(`(^|\\s)(${ARABIC_MID_CLAUSE})\\.(\\s+)`, "gu"), "$1$2$3");

  // Stacked junk
  t = t.replace(/[,]{2,}/g, ",");
  t = t.replace(/\.{2,}/g, ".");
  t = t.replace(/,\s*\./g, ".");

  return finalizeSpacing(text, t);
}
