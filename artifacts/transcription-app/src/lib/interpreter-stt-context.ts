/**
 * Soniox WebSocket `context` for phone / video interpreter sessions.
 * @see https://soniox.com/docs/stt/concepts/context
 *
 * Recognition-only: bias STT to write each pair language in its own script.
 * Do NOT pin English medical/legal word lists here — that made Arabic (and other
 * pair languages) transcribe as English that was never spoken.
 *
 * Context must stay under 10k chars (Soniox limit).
 */

import { stableSonioxBilingualOrder } from "./soniox-stt-language-hints";

export type LangPair = { a: string; b: string };

/** English demonym for interpreter intro lines (language B in pair when A is English, etc.). */
const DEMONYM_BY_BASE: Record<string, string> = {
  ar: "Arabic",
  bg: "Bulgarian",
  zh: "Chinese",
  hr: "Croatian",
  cs: "Czech",
  da: "Danish",
  nl: "Dutch",
  en: "English",
  fa: "Persian",
  fi: "Finnish",
  fr: "French",
  de: "German",
  el: "Greek",
  he: "Hebrew",
  hi: "Hindi",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  ms: "Malay",
  nb: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sk: "Slovak",
  so: "Somali",
  es: "Spanish",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
};

/** Workspace languages primarily written in non-Latin scripts (for LID / romanization bias). */
const NON_LATIN_SCRIPT_BASES = new Set<string>([
  "ar", "be", "bg", "bn", "el", "fa", "gu", "he", "hi", "ja", "kn", "kk", "ko", "ml", "mr", "mk",
  "pa", "ru", "sr", "ta", "te", "th", "uk", "ur", "zh",
]);

/** Per-language Soniox STT script instructions (Arabic handled separately). */
const NON_LATIN_SCRIPT_STT_BIAS: readonly {
  lang: string;
  instruction: string;
}[] = [
  { lang: "he", instruction: "Always transcribe Hebrew speech in Hebrew script. Never romanize." },
  { lang: "hi", instruction: "Always transcribe Hindi speech in Devanagari. Never romanize." },
  {
    lang: "zh",
    instruction: "Always transcribe Chinese speech in Chinese characters (Hanzi). Never romanize or use Pinyin.",
  },
  {
    lang: "ja",
    instruction:
      "Always transcribe Japanese speech in Japanese script (Hiragana/Katakana/Kanji). Never romanize.",
  },
  { lang: "ko", instruction: "Always transcribe Korean speech in Hangul. Never romanize." },
  { lang: "th", instruction: "Always transcribe Thai speech in Thai script. Never romanize." },
  { lang: "ur", instruction: "Always transcribe Urdu speech in Urdu/Nastaliq script. Never romanize." },
];

/** Short Arabic recognition anchors only — not English medical vocabulary. */
const ARABIC_STT_BIAS_TERMS: readonly string[] = [
  "مرحبا",
  "شكراً",
  "نعم",
  "لا",
  "من فضلك",
  "واش",
  "بزاف",
  "برشا",
  "كيفاش",
  "علاش",
  "صافي",
  "دابا",
  "توا",
];

function base(code: string): string {
  return (code || "en").split("-")[0]!.toLowerCase();
}

function pairIncludesLang(pair: LangPair, lang: string): boolean {
  return base(pair.a) === lang || base(pair.b) === lang;
}

function pairIncludesArabic(pair: LangPair): boolean {
  return pairIncludesLang(pair, "ar");
}

function pairIncludesSomali(pair: LangPair): boolean {
  return pairIncludesLang(pair, "so");
}

function usesLatinScript(code: string): boolean {
  return !NON_LATIN_SCRIPT_BASES.has(base(code));
}

function pairUsesLatinScriptOnly(pair: LangPair): boolean {
  return usesLatinScript(pair.a) && usesLatinScript(pair.b);
}

export function getInterpreterDemonyms(pair: LangPair): string[] {
  return [...new Set([demonymFor(pair.a), demonymFor(pair.b)])];
}

function demonymFor(code: string): string {
  const b = base(code);
  if (b === "zh") {
    return "Chinese";
  }
  return DEMONYM_BY_BASE[b] ?? b;
}

/** Common Somali words/phrases for Soniox `terms` when `so` is in the pair (Soniox has no native `so` STT). */
const SOMALI_STT_BIAS_TERMS: readonly string[] = [
  "nabadgelyo",
  "mahadsanid",
  "salaan",
  "fadlan",
  "waxaan",
  "waan",
  "haa",
  "maya",
  "sidee",
  "turjumaan",
  "af Soomaali",
  "Soomaali",
  "waan fahmay",
  "ma fahmin",
];

/**
 * Recognition context for bilingual interpreter STT.
 * Keeps English and the other pair language equally writable from the first token.
 */
export function buildSonioxInterpreterContext(pair: LangPair): {
  general: { key: string; value: string }[];
  text: string;
  terms: string[];
} {
  // Same Soniox config for en↔ar and ar↔en (UI A/B must not change STT bias).
  const ordered = stableSonioxBilingualOrder(pair);
  const da = demonymFor(ordered.a);
  const db = demonymFor(ordered.b);
  const demonyms = [...new Set([da, db])].filter(Boolean);
  const somaliPair = pairIncludesSomali(pair);
  const arabicPair = pairIncludesArabic(pair);

  const general: { key: string; value: string }[] = [
    { key: "domain", value: "Live telephone or video interpreter call" },
    {
      key: "speakers",
      value:
        "Usually 2 speakers, sometimes 3 if the interpreter speaks. " +
        "Separate each real voice; do not invent extra speakers.",
    },
    { key: "language", value: `${da} and ${db}` },
    {
      key: "instructions",
      value:
        `This session is only ${da} and ${db}. ` +
        `On every utterance, write the language that is actually being spoken in that language's own script — ` +
        `from the first token, exactly as heard. ` +
        `Never write ${da} speech as ${db}, or ${db} speech as ${da}. ` +
        `Never romanize a non-Latin language.`,
    },
  ];

  if (arabicPair) {
    general.push({
      key: "arabic_script",
      value:
        "Arabic speech must be written in Arabic script (right-to-left). " +
        "Never romanize or transliterate Arabic into Latin letters. " +
        "Keep dialect as spoken on the original — do not rewrite into الفصحى / MSA here.",
    });
  }

  if (somaliPair) {
    general.push({
      key: "somali_script",
      value:
        "Somali speech must be written in Somali Latin orthography. English speech stays English.",
    });
  }

  for (const entry of NON_LATIN_SCRIPT_STT_BIAS) {
    if (!pairIncludesLang(pair, entry.lang)) continue;
    general.push({ key: "script", value: entry.instruction });
  }

  if (pairUsesLatinScriptOnly(pair) && !somaliPair) {
    general.push({
      key: "latin_pair",
      value:
        `Speakers alternate between ${da} and ${db}. ` +
        "Transcribe each speaker in the language they are speaking — never substitute one for the other.",
    });
  }

  // Minimal interpreter-line pins only (both languages named). No English medical lists.
  const terms: string[] = [];
  for (const d of demonyms) {
    terms.push(
      `you're through to the ${d} interpreter`,
      `you are through to the ${d} interpreter`,
      `thank you for calling the ${d} interpreter`,
    );
  }
  terms.push(
    "you're through to the interpreter",
    "you are through to the interpreter",
    "thank you for calling",
    "my name is",
    "my ID number is",
  );

  if (somaliPair) {
    terms.push(...SOMALI_STT_BIAS_TERMS);
  }
  if (arabicPair) {
    terms.push(...ARABIC_STT_BIAS_TERMS);
  }

  return {
    general,
    // Omit free-form English boilerplate — it biased early tokens toward English.
    text: "",
    terms: [...new Set(terms)],
  };
}

/** Strip empty `text` so Soniox does not get a useless English-leaning field. */
export function sonioxContextForRealtimePayload(ctx: {
  general: { key: string; value: string }[];
  text?: string;
  terms?: string[];
  translation_terms?: { source: string; target: string }[];
}): {
  general: { key: string; value: string }[];
  text?: string;
  terms?: string[];
  translation_terms?: { source: string; target: string }[];
} {
  const out: {
    general: { key: string; value: string }[];
    text?: string;
    terms?: string[];
    translation_terms?: { source: string; target: string }[];
  } = { general: ctx.general };
  if (ctx.text?.trim()) out.text = ctx.text.trim();
  if (ctx.terms && ctx.terms.length > 0) out.terms = ctx.terms;
  if (ctx.translation_terms && ctx.translation_terms.length > 0) {
    out.translation_terms = ctx.translation_terms;
  }
  return out;
}
