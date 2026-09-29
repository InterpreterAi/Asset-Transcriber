/**
 * Trial · Soniox X only.
 *
 * Short, pair-scoped Soniox context following the official guidance:
 * https://soniox.com/docs/stt/concepts/context
 * - `general`: a few short key/value lines (domain, language, instructions, translation).
 * - Language detection: `language` + `instructions` keys and `terms` in the spoken language.
 * - No long rule text and no dialect lists: Soniox has one code per language
 *   (e.g. a single `ar` for every Arabic dialect) and recognizes dialects natively.
 */
import { languages } from "./languages";

export type SonioxStartContext = {
  general?: { key: string; value: string }[];
  text?: string;
  terms?: string[];
  translation_terms?: { source: string; target: string }[];
};

/** Professional standard written variety used when translating INTO each language. */
const STANDARD_OVERRIDES: Record<string, string> = {
  ar: "Modern Standard Arabic (الفصحى) only, never dialect",
  en: "standard professional English, American spelling",
  es: "neutral standard Spanish (español estándar)",
  fr: "standard French (français de France)",
  de: "Standard High German (Hochdeutsch)",
  pl: "standard Polish (język ogólnopolski)",
  pt: "standard Portuguese (norma culta)",
  it: "standard Italian",
  ja: "standard Japanese (標準語 / hyōjungo)",
  zh: "Standard Mandarin, simplified characters",
  nl: "standard Dutch (Algemeen Nederlands)",
  no: "Norwegian Bokmål",
  fa: "standard Iranian Persian",
  hi: "standard Hindi (Devanagari)",
  id: "standard Indonesian (bahasa baku)",
  ms: "standard Malay (bahasa baku)",
  tl: "standard Filipino (Tagalog)",
  eu: "standard Basque (Euskara Batua)",
};

export const STABLE_WRITTEN_DIALECT: Record<string, string> = Object.fromEntries(
  languages.map((lang) => [lang.code, STANDARD_OVERRIDES[lang.code] ?? `standard ${lang.name}`]),
);

/** Non-Latin scripts, so each side is written in its own alphabet (not transliterated). */
const SCRIPT_NAME: Record<string, string> = {
  ar: "Arabic script",
  fa: "Persian script",
  ur: "Urdu script",
  he: "Hebrew script",
  ja: "Japanese script",
  zh: "Chinese characters",
  ko: "Hangul",
  ru: "Cyrillic",
  uk: "Cyrillic",
  bg: "Cyrillic",
  mk: "Cyrillic",
  be: "Cyrillic",
  kk: "Cyrillic",
  el: "Greek script",
  hi: "Devanagari",
  mr: "Devanagari",
  bn: "Bengali script",
  gu: "Gujarati script",
  pa: "Gurmukhi",
  ta: "Tamil script",
  te: "Telugu script",
  kn: "Kannada script",
  ml: "Malayalam script",
  th: "Thai script",
};

/**
 * Everyday call words in the non-English language. Soniox: adding `terms` in the
 * correct language helps detection. Words used across all regional varieties only;
 * no words that are also English.
 */
const COMMON_CALL_WORDS: Record<string, string[]> = {
  ar: ["نعم", "لا", "طيب", "تمام", "يعني", "الحمد لله", "إن شاء الله", "دكتور", "موعد", "مستشفى", "تأمين", "محامي"],
  es: ["sí", "bueno", "pues", "entonces", "gracias", "médico", "cita", "seguro", "abogado"],
  pt: ["sim", "não", "então", "obrigado", "obrigada", "médico", "consulta", "seguro", "advogado"],
  fr: ["oui", "d'accord", "alors", "merci", "s'il vous plaît", "médecin", "rendez-vous", "avocat"],
  pl: ["tak", "nie", "dobrze", "dziękuję", "lekarz", "wizyta", "ubezpieczenie", "prawnik"],
  de: ["ja", "nein", "genau", "danke", "bitte", "Arzt", "Termin", "Versicherung", "Anwalt"],
  it: ["sì", "allora", "grazie", "prego", "medico", "appuntamento", "assicurazione", "avvocato"],
};

/** Everyday English phrases pinned to the standard target wording (translation only). */
const AR_EN_MSA_TERMS: { source: string; target: string }[] = [
  { source: "next time", target: "المرة القادمة" },
  { source: "that's why", target: "لذلك" },
  { source: "that is why", target: "لذلك" },
  { source: "that's all", target: "هذا كل شيء" },
  { source: "you need to know", target: "يجب أن تعرف" },
  { source: "I get you", target: "أفهمك" },
  { source: "no one", target: "لا أحد" },
  { source: "nobody", target: "لا أحد" },
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

const DE_EN_STANDARD_TERMS: { source: string; target: string }[] = [
  { source: "next time", target: "nächstes Mal" },
  { source: "that's why", target: "deshalb" },
  { source: "that is why", target: "deshalb" },
  { source: "that's all", target: "das ist alles" },
  { source: "you need to know", target: "Sie müssen das wissen" },
  { source: "I get you", target: "ich verstehe Sie" },
  { source: "no one", target: "niemand" },
  { source: "nobody", target: "niemand" },
];

const JA_EN_STANDARD_TERMS: { source: string; target: string }[] = [
  { source: "next time", target: "次回" },
  { source: "that's why", target: "だから" },
  { source: "that is why", target: "だから" },
  { source: "that's all", target: "それだけです" },
  { source: "you need to know", target: "知っておく必要があります" },
  { source: "I get you", target: "わかりました" },
  { source: "no one", target: "誰も" },
  { source: "nobody", target: "誰も" },
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

const STANDARD_PHRASE_TERMS: Record<string, { source: string; target: string }[]> = {
  ar: AR_EN_MSA_TERMS,
  es: ES_EN_STANDARD_TERMS,
  de: DE_EN_STANDARD_TERMS,
  ja: JA_EN_STANDARD_TERMS,
  pl: PL_EN_STANDARD_TERMS,
};

const LANG_NAME: Record<string, string> = Object.fromEntries(
  languages.map((lang) => [lang.code, lang.name]),
);

function langBase(code: string): string {
  return (code || "").split("-")[0]?.toLowerCase() ?? "";
}

function nameOf(code: string): string {
  return LANG_NAME[code] ?? code;
}

function standardFor(code: string): string {
  return STABLE_WRITTEN_DIALECT[code] ?? `standard ${nameOf(code)}`;
}

function spokenAs(code: string): string {
  const script = SCRIPT_NAME[code];
  return `${nameOf(code)} speech in ${nameOf(code)}${script ? ` (${script})` : ""}`;
}

/** Pair-scoped Soniox context: four short `general` lines, call words, standard-phrase pins. */
export function buildStableDialectContext(langA: string, langB: string): SonioxStartContext {
  const a = langBase(langA);
  const b = langBase(langB);
  const nameA = nameOf(a);
  const nameB = nameOf(b);
  const arabicPair = a === "ar" || b === "ar";
  const englishPair = a === "en" || b === "en";
  const other = a === "en" ? b : a;

  let instructions =
    `Speakers alternate between ${nameA} and ${nameB}. ` +
    `Write each utterance in the language actually spoken: ${spokenAs(a)}, ${spokenAs(b)}.`;
  if (arabicPair) {
    instructions += englishPair
      ? " اكتب الكلام العربي بالحروف العربية كما قيل، والكلام الإنجليزي بالإنجليزية."
      : " اكتب الكلام العربي بالحروف العربية كما قيل.";
  }

  let translation =
    "Professional interpreter translation of the full meaning, nothing added or dropped. " +
    `Into ${nameA}: ${standardFor(a)}. Into ${nameB}: ${standardFor(b)}.`;
  if (englishPair && other !== "en") {
    translation += ` Do not copy English words or abbreviations into the ${nameOf(other)} translation.`;
  }

  const general: { key: string; value: string }[] = [
    { key: "domain", value: "Live telephone and video interpreting (medical, legal, insurance)" },
    { key: "language", value: `${nameA} and ${nameB}` },
    { key: "instructions", value: instructions },
    { key: "translation", value: translation },
  ];

  const terms: string[] = [];
  const seenTerm = new Set<string>();
  const addTerm = (t: string) => {
    const k = t.toLowerCase();
    if (seenTerm.has(k)) return;
    seenTerm.add(k);
    terms.push(t);
  };
  for (const code of [a, b]) {
    if (LANG_NAME[code]) addTerm(`you're through to the ${nameOf(code)} interpreter`);
  }
  for (const code of [a, b]) {
    for (const word of COMMON_CALL_WORDS[code] ?? []) addTerm(word);
  }

  const translation_terms: { source: string; target: string }[] = [];
  if (englishPair) {
    translation_terms.push(...(STANDARD_PHRASE_TERMS[other] ?? []));
  }

  const ctx: SonioxStartContext = { general };
  if (terms.length > 0) ctx.terms = terms;
  if (translation_terms.length > 0) ctx.translation_terms = translation_terms;
  return ctx;
}

export function dialectPinsCoverOfficialLanguages(): boolean {
  return languages.every((lang) => Boolean(STABLE_WRITTEN_DIALECT[lang.code]));
}
