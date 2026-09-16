/**
 * Trial · Soniox X only.
 *
 * Soniox has a single `ar` code (no dialect IDs). Context applies to BOTH
 * recognition and translation, so فصحى belongs only in translation-labeled
 * keys. Originals must keep every spoken Arabic dialect.
 *
 * https://soniox.com/docs/stt/concepts/context
 */
import { languages } from "./languages";

export type SonioxStartContext = {
  general?: { key: string; value: string }[];
  text?: string;
  terms?: string[];
  translation_terms?: { source: string; target: string }[];
};

/** Stable written variety for the TRANSLATION column only. Originals stay as spoken. */
export const STABLE_WRITTEN_DIALECT: Record<string, string> = {
  af: "Standard Afrikaans (translation only)",
  sq: "Standard Albanian / Tosk (translation only)",
  ar: "Modern Standard Arabic (فصحى / fuṣḥā) for the TRANSLATION column only.",
  az: "Standard Azerbaijani (translation only)",
  eu: "Standard Basque / Euskara Batua (translation only)",
  be: "Standard Belarusian (translation only)",
  bn: "Standard written Bengali (translation only)",
  bs: "Standard Bosnian (translation only)",
  bg: "Standard Bulgarian (translation only)",
  ca: "Standard Catalan (translation only)",
  zh: "Standard Mandarin / Putonghua, simplified characters (translation only). Cantonese and other topolects still go in the original if spoken.",
  hr: "Standard Croatian (translation only)",
  cs: "Standard Czech (translation only)",
  da: "Standard Danish / rigsdansk (translation only)",
  nl: "Standard Dutch / Algemeen Nederlands (translation only). Flemish dialect still goes in the original if spoken.",
  en: "Standard English, general American spelling (translation only). Regional slang still goes in the original if spoken.",
  et: "Standard Estonian (translation only)",
  fi: "Standard Finnish (translation only)",
  fr: "Standard French / français de France (translation only). Québec joual and Maghrebi slang still go in the original if spoken.",
  gl: "Standard Galician (translation only)",
  de: "Standard High German / Hochdeutsch (translation only). Swiss German, Bavarian, and Austrian dialect still go in the original if spoken.",
  el: "Standard Modern Greek (translation only)",
  gu: "Standard Gujarati (translation only)",
  he: "Standard Modern Hebrew (translation only)",
  hi: "Standard Hindi / Khari Boli, Devanagari (translation only)",
  hu: "Standard Hungarian (translation only)",
  id: "Standard Indonesian / Bahasa Indonesia baku (translation only). Jakartan slang still goes in the original if spoken.",
  it: "Standard Italian (translation only). Regional dialects still go in the original if spoken.",
  ja: "Standard Japanese / hyōjungo (translation only). Kansai-ben and other dialects still go in the original if spoken.",
  kn: "Standard Kannada (translation only)",
  kk: "Standard Kazakh (translation only)",
  ko: "Standard Korean / Seoul (translation only). Regional dialects still go in the original if spoken.",
  lv: "Standard Latvian (translation only)",
  lt: "Standard Lithuanian (translation only)",
  mk: "Standard Macedonian (translation only)",
  ms: "Standard Malay / Bahasa Melayu baku (translation only)",
  ml: "Standard Malayalam (translation only)",
  mr: "Standard Marathi (translation only)",
  no: "Standard Norwegian Bokmål (translation only)",
  fa: "Standard Iranian Persian / Farsi (translation only). Dari or Tajik still go in the original if spoken.",
  pl: "Standard Polish / język ogólnopolski (translation only). Regional dialect and slang still go in the original if spoken.",
  pt: "Standard Portuguese / norma culta (translation only). Regional slang still goes in the original if spoken.",
  pa: "Standard Punjabi (translation only)",
  ro: "Standard Romanian (translation only)",
  ru: "Standard Russian (translation only)",
  sr: "Standard Serbian (translation only)",
  sk: "Standard Slovak (translation only)",
  sl: "Standard Slovenian (translation only)",
  es: "Neutral standard Spanish / español estándar (translation only). Rioplatense, Caribbean, and Mexican slang still go in the original if spoken.",
  sw: "Standard Swahili (translation only)",
  sv: "Standard Swedish (translation only)",
  tl: "Standard Filipino / Tagalog (translation only)",
  ta: "Standard Tamil (translation only)",
  te: "Standard Telugu (translation only)",
  th: "Standard Thai (translation only)",
  tr: "Standard Turkish / İstanbul (translation only). Regional dialect still goes in the original if spoken.",
  uk: "Standard Ukrainian (translation only)",
  ur: "Standard Urdu (translation only)",
  vi: "Standard Vietnamese / Hanoi (translation only). Regional dialect still goes in the original if spoken.",
  cy: "Standard Welsh (translation only)",
};

const LANG_NAME: Record<string, string> = Object.fromEntries(
  languages.map((lang) => [lang.code, lang.name]),
);

function langBase(code: string): string {
  return (code || "").split("-")[0]?.toLowerCase() ?? "";
}

function pinFor(code: string): string {
  const base = langBase(code);
  return STABLE_WRITTEN_DIALECT[base] ?? `Standard written ${base || "target language"}`;
}

function registerKey(code: string): string {
  const name = (LANG_NAME[langBase(code)] ?? langBase(code)).toLowerCase().replace(/\s+/g, "_");
  return `${name}_translation_register`;
}

/** Spoken Arabic the original column must keep. Not a ban list — STT must write these. */
const AR_SPOKEN_DIALECTS =
  "Yemeni, Iraqi, Gulf, Hijazi, Najdi, Levantine, Egyptian, Sudanese, Moroccan Darija, Algerian, Tunisian, Libyan, Hassaniya, and every other Maghrebi or Arabian variety";

/** High-frequency dialect particles so Soniox treats them as Arabic, not noise or French. */
const AR_DIALECT_RECOGNITION_TERMS = [
  "شلون",
  "وين",
  "واش",
  "بزاف",
  "برشا",
  "قديش",
  "هسه",
  "ازاي",
  "يعني",
  "علاش",
  "هلق",
  "كده",
];

/** Extra translation-only guidance when the pair includes a high-drift language. */
const PAIR_TRANSLATION_TEXT: Record<string, string> = {
  ar:
    "TRANSLATION COLUMN into Arabic: Modern Standard Arabic only (الفصحى), like news/subtitles. " +
    `Do not copy dialect into the translation even if the audio is ${AR_SPOKEN_DIALECTS}. ` +
    "Never repeat English words or Latin abbreviations in the Arabic translation (Sonogram → تصوير بالموجات فوق الصوتية). " +
    `ORIGINAL COLUMN: write every Arabic dialect as spoken (${AR_SPOKEN_DIALECTS}). ` +
    "Maghrebi, Algerian, Tunisian, and Darija are Arabic, not French. Never skip or silence Arabic speech.",
  es:
    "TRANSLATION COLUMN into Spanish: neutral standard Spanish (español estándar), like news/subtitles. " +
    "Do not copy Rioplatense, Caribbean, Mexican slang, or voseo into the translation. " +
    "Never repeat English words or Latin abbreviations in the Spanish translation (Sonogram → ecografía). " +
    "ORIGINAL COLUMN: transcribe spoken Spanish exactly, including dialect.",
  fr:
    "TRANSLATION COLUMN into French: standard French (français de France). Not Québec joual or Maghrebi slang in the translation. " +
    "ORIGINAL COLUMN: transcribe spoken French exactly, including dialect.",
  de:
    "TRANSLATION COLUMN into German: Standard High German (Hochdeutsch). Not Swiss German or Bavarian in the translation. " +
    "ORIGINAL COLUMN: transcribe spoken German exactly, including dialect.",
  pl:
    "TRANSLATION COLUMN into Polish: standard Polish (język ogólnopolski), like news/subtitles. " +
    "Do not copy regional dialect or slang into the translation. " +
    "Never repeat English words or Latin abbreviations in the Polish translation (Sonogram → ultrasonografia). " +
    "ORIGINAL COLUMN: transcribe spoken Polish exactly, including dialect.",
};

const AR_EN_MSA_TERMS: { source: string; target: string }[] = [
  { source: "next time", target: "المرة القادمة" },
  { source: "that's why", target: "لذلك" },
  { source: "that is why", target: "لذلك" },
  { source: "that's all", target: "هذا كل شيء" },
  { source: "you need to know", target: "يجب أن تعرف" },
  { source: "I get you", target: "أفهمك" },
  { source: "no one", target: "لا أحد" },
  { source: "nobody", target: "لا أحد" },
  { source: "family bucket", target: "وجبة العائلة" },
];

const ES_EN_STANDARD_TERMS: { source: string; target: string }[] = [
  { source: "next time", target: "la próxima vez" },
  { source: "that's why", target: "por eso" },
  { source: "that is why", target: "por eso" },
  { source: "that's all", target: "eso es todo" },
  { source: "you need to know", target: "usted necesita saber" },
  { source: "I get you", target: "le entiendo" },
  { source: "no one", target: "nadie" },
  { source: "nobody", target: "nadie" },
];

const PL_EN_STANDARD_TERMS: { source: string; target: string }[] = [
  { source: "next time", target: "następnym razem" },
  { source: "that's why", target: "dlatego" },
  { source: "that is why", target: "dlatego" },
  { source: "that's all", target: "to wszystko" },
  { source: "you need to know", target: "trzeba o tym wiedzieć" },
  { source: "I get you", target: "rozumiem" },
  { source: "no one", target: "nikt" },
  { source: "nobody", target: "nikt" },
];

/** Pair-scoped Soniox context. Short `general` keys; no 60-language dump. */
export function buildStableDialectContext(langA: string, langB: string): SonioxStartContext {
  const a = langBase(langA);
  const b = langBase(langB);
  const pinA = pinFor(a);
  const pinB = pinFor(b);
  const arabicPair = a === "ar" || b === "ar";
  const general: { key: string; value: string }[] = [
    { key: "domain", value: "Live two-way interpretation" },
    {
      key: "languages",
      value: arabicPair
        ? `Two-way ${LANG_NAME[a] ?? a} and ${LANG_NAME[b] ?? b}. Both languages will be spoken. Arabic includes ${AR_SPOKEN_DIALECTS}. Transcribe whichever is spoken; Maghrebi/Darija is Arabic, not French; do not ignore Arabic dialect as silence.`
        : `Two-way ${LANG_NAME[a] ?? a} and ${LANG_NAME[b] ?? b}. Both languages will be spoken. Transcribe whichever is spoken; do not ignore one side.`,
    },
    {
      key: "transcription",
      value:
        "Original column: transcribe everything spoken in either pair language, exactly as spoken — dialect, slang, and code-switching included. Never drop one side. Do not rewrite originals into the standard written variety." +
        (arabicPair
          ? ` Arabic originals MUST include ${AR_SPOKEN_DIALECTS}. Write them in Arabic script as heard. Do not skip dialect. Do not treat Maghrebi/Darija/Algerian/Tunisian as French or as silence.`
          : ""),
    },
    {
      key: "translation",
      value:
        "Translation column only: always the stable standard written variety of the TARGET language. Never copy the spoken dialect into the translation. Never echo the source-language word or Latin abbreviation in the translation; use only the target wording from translation_terms." +
        (arabicPair ? " When the target is Arabic, use الفصحى / Modern Standard Arabic only." : ""),
    },
    { key: registerKey(a), value: `TRANSLATION into ${LANG_NAME[a] ?? a} uses: ${pinA}` },
    { key: registerKey(b), value: `TRANSLATION into ${LANG_NAME[b] ?? b} uses: ${pinB}` },
    {
      key: "numbers",
      value:
        "Keep phone numbers, dates, times, and numeric IDs in the same digit sequence as spoken. Do not reverse digits.",
    },
  ];
  if (arabicPair) {
    general.push({
      key: "instructions",
      value:
        `Arabic will be spoken in any dialect (${AR_SPOKEN_DIALECTS}). Transcribe that original as dialect Arabic. Translation into Arabic is الفصحى only.`,
    });
  }

  const textParts = [a, b]
    .map((code) => PAIR_TRANSLATION_TEXT[code])
    .filter((part): part is string => Boolean(part));

  const translation_terms: { source: string; target: string }[] = [];
  if (arabicPair) {
    translation_terms.push(...AR_EN_MSA_TERMS);
  }
  if (a === "es" || b === "es") {
    translation_terms.push(...ES_EN_STANDARD_TERMS);
  }
  if (a === "pl" || b === "pl") {
    translation_terms.push(...PL_EN_STANDARD_TERMS);
  }

  const ctx: SonioxStartContext = { general };
  if (textParts.length > 0) ctx.text = textParts.join(" ");
  if (translation_terms.length > 0) ctx.translation_terms = translation_terms;
  if (arabicPair) ctx.terms = [...AR_DIALECT_RECOGNITION_TERMS];
  return ctx;
}

export function dialectPinsCoverOfficialLanguages(): boolean {
  return languages.every((lang) => Boolean(STABLE_WRITTEN_DIALECT[lang.code]));
}
