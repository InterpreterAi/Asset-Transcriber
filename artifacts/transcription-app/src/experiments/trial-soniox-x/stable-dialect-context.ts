/**
 * Trial · Soniox X only.
 *
 * Soniox has a single `ar` / `es` / … code (no dialect IDs). Pin the
 * TRANSLATION column to the standard written variety via `context`.
 * Originals stay as spoken — including dialect — so we do not ask STT to
 * rewrite Egyptian into فصحى (that would pollute the original column).
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

/** Stable written variety for every official Soniox live-demo language. */
export const STABLE_WRITTEN_DIALECT: Record<string, string> = {
  af: "Standard Afrikaans",
  sq: "Standard Albanian (Tosk)",
  ar: "Modern Standard Arabic (فصحى / fuṣḥā). Never Egyptian, Levantine, Gulf, Maghrebi, or other spoken dialects.",
  az: "Standard Azerbaijani",
  eu: "Standard Basque (Euskara Batua)",
  be: "Standard Belarusian",
  bn: "Standard Bengali (written standard)",
  bs: "Standard Bosnian",
  bg: "Standard Bulgarian",
  ca: "Standard Catalan",
  zh: "Standard Mandarin Chinese (Putonghua), simplified characters. Not Cantonese or other topolects.",
  hr: "Standard Croatian",
  cs: "Standard Czech",
  da: "Standard Danish (rigsdansk)",
  nl: "Standard Dutch (Algemeen Nederlands). Not Flemish dialect.",
  en: "Standard English (general American spelling and grammar). Not regional slang as the default.",
  et: "Standard Estonian",
  fi: "Standard Finnish",
  fr: "Standard French (français standard / France). Not Québec joual, Maghrebi slang, or regional dialects.",
  gl: "Standard Galician",
  de: "Standard High German (Hochdeutsch / Standarddeutsch). Not Swiss German, Bavarian, or Austrian dialect.",
  el: "Standard Modern Greek",
  gu: "Standard Gujarati",
  he: "Standard Modern Hebrew",
  hi: "Standard Hindi (Khari Boli, Devanagari)",
  hu: "Standard Hungarian",
  id: "Standard Indonesian (Bahasa Indonesia baku). Not Jakartan slang.",
  it: "Standard Italian. Not regional dialects.",
  ja: "Standard Japanese (hyōjungo). Not Kansai-ben or other dialects.",
  kn: "Standard Kannada",
  kk: "Standard Kazakh",
  ko: "Standard Korean (Seoul). Not regional dialects.",
  lv: "Standard Latvian",
  lt: "Standard Lithuanian",
  mk: "Standard Macedonian",
  ms: "Standard Malay (Bahasa Melayu baku)",
  ml: "Standard Malayalam",
  mr: "Standard Marathi",
  no: "Standard Norwegian Bokmål",
  fa: "Standard Persian (Iranian Farsi). Not Dari or Tajik as the default.",
  pl: "Standard Polish (polszczyzna ogólna / język ogólnopolski). Not regional dialect or heavy slang.",
  pt: "Standard Portuguese (norma culta). Neutral written Portuguese, not heavy regional slang.",
  pa: "Standard Punjabi",
  ro: "Standard Romanian",
  ru: "Standard Russian",
  sr: "Standard Serbian",
  sk: "Standard Slovak",
  sl: "Standard Slovenian",
  es: "Neutral standard Spanish (español estándar). Not Rioplatense vos, Caribbean slang, or other regional dialects as the default.",
  sw: "Standard Swahili",
  sv: "Standard Swedish",
  tl: "Standard Filipino / Tagalog",
  ta: "Standard Tamil",
  te: "Standard Telugu",
  th: "Standard Thai",
  tr: "Standard Turkish (İstanbul). Not regional dialect.",
  uk: "Standard Ukrainian",
  ur: "Standard Urdu",
  vi: "Standard Vietnamese (Hanoi). Not regional dialect as the default.",
  cy: "Standard Welsh",
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

/** Extra translation-only guidance when the pair includes a high-drift language. */
const PAIR_TRANSLATION_TEXT: Record<string, string> = {
  ar:
    "TRANSLATION into Arabic must be Modern Standard Arabic only (الفصحى), like news/subtitles. " +
    "Do not copy the speaker's dialect into the translation even if the audio is Egyptian, Levantine, Gulf, or Maghrebi. " +
    "Forbidden in Arabic translations: يا عم, مش, كده, عشان, عشان كده, ما فيش, لازم (use يجب أن), المرة الجاية (use المرة القادمة), تاكل (use تأكل), ده/دي (use هذا/هذه). " +
    "Never repeat English words or Latin abbreviations in the Arabic translation; use only Arabic (Sonogram → تصوير بالموجات فوق الصوتية, not تصوير صوتي Sonogram). " +
    "Original/transcript of Arabic speech stays exactly as spoken.",
  es:
    "TRANSLATION into Spanish must be neutral standard Spanish (español estándar), like news/subtitles. " +
    "Do not copy the speaker's dialect into the translation even if the audio is Rioplatense, Caribbean, Mexican slang, or voseo. " +
    "Never repeat English words or Latin abbreviations in the Spanish translation; use only Spanish (Sonogram → ecografía, not ecografía Sonogram). " +
    "Original/transcript of Spanish speech stays exactly as spoken.",
  fr:
    "TRANSLATION into French must be standard French (français de France). Not Québec joual or Maghrebi slang. Original speech may stay dialectal.",
  de:
    "TRANSLATION into German must be Standard High German (Hochdeutsch). Not Swiss German or Bavarian. Original speech may stay dialectal.",
  pl:
    "TRANSLATION into Polish must be standard Polish (język ogólnopolski / polszczyzna ogólna), like news/subtitles. " +
    "Do not copy regional dialect or slang into the translation. " +
    "Never repeat English words or Latin abbreviations in the Polish translation; use only Polish (Sonogram → ultrasonografia, not ultrasonografia Sonogram). " +
    "Original/transcript of Polish speech stays exactly as spoken.",
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
  const general: { key: string; value: string }[] = [
    { key: "domain", value: "Live two-way interpretation" },
    {
      key: "transcription",
      value:
        "Original: transcribe exactly as spoken, including dialect. Do not rewrite original Arabic into الفصحى.",
    },
    {
      key: "translation",
      value:
        "Translation column only: always the stable standard written variety of the TARGET language. Never copy the spoken dialect into the translation. Never echo the source-language word or Latin abbreviation in the translation; use only the target wording from translation_terms.",
    },
    { key: registerKey(a), value: `Translated ${LANG_NAME[a] ?? a} uses: ${pinA}` },
    { key: registerKey(b), value: `Translated ${LANG_NAME[b] ?? b} uses: ${pinB}` },
    {
      key: "numbers",
      value:
        "Keep phone numbers, dates, times, and numeric IDs in the same digit sequence as spoken. Do not reverse digits.",
    },
  ];

  const textParts = [a, b]
    .map((code) => PAIR_TRANSLATION_TEXT[code])
    .filter((part): part is string => Boolean(part));

  const translation_terms: { source: string; target: string }[] = [];
  if (a === "ar" || b === "ar") {
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
  return ctx;
}

export function dialectPinsCoverOfficialLanguages(): boolean {
  return languages.every((lang) => Boolean(STABLE_WRITTEN_DIALECT[lang.code]));
}
