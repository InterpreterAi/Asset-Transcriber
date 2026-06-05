/**
 * Soniox WebSocket `context` for phone / video interpreter sessions.
 * @see https://soniox.com/docs/stt/api-reference/websocket-api
 *
 * Context must stay under 10k chars (Soniox limit).
 */

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

function base(code: string): string {
  return (code || "en").split("-")[0]!.toLowerCase();
}

function pairIncludesSomali(pair: LangPair): boolean {
  return base(pair.a) === "so" || base(pair.b) === "so";
}

export function getInterpreterDemonyms(pair: LangPair): string[] {
  return [...new Set([demonymFor(pair.a), demonymFor(pair.b)])];
}

function demonymFor(code: string): string {
  const b = base(code);
  if (b === "zh") {
    return code.toLowerCase().includes("tw") || code.toLowerCase().includes("hant")
      ? "Chinese"
      : "Chinese";
  }
  return DEMONYM_BY_BASE[b] ?? b;
}

/** Common Somali words/phrases for Soniox `terms` when `so` is in the pair (Soniox has no native `so` STT). */
const SOMALI_STT_BIAS_TERMS: readonly string[] = [
  "nabadgelyo",
  "nabad gelyo",
  "mahadsanid",
  "waad mahadsantahay",
  "salaan",
  "salaam",
  "fadlan",
  "waxaan",
  "waan",
  "waa",
  "baa",
  "ayuu",
  "ayay",
  "tahay",
  "maya",
  "haa",
  "sidee",
  "sidee tahay",
  "turjumaan",
  "turjubaan",
  "af Ingiriisi",
  "af Soomaali",
  "Soomaali",
  "Soomaaliya",
  "caafimaad",
  "dawlada",
  "codsiga",
  "waan ku",
  "waan kuu",
  "igu soo",
  "maalin",
  "wanaagsan",
  "wanagsan",
  "fiican",
  "waan fahmay",
  "ma fahmin",
  "fadlan ii",
  "fadlan i",
  "waan rabaa",
  "waxaad",
  "waxay",
  "waxuu",
  "waxuu yiri",
  "waxaan ku",
  "waxaan idin",
  "waan idin",
  "waad",
  "waan",
  "aad",
  "iyo",
  "oo",
  "ka",
  "ku",
  "la",
  "ee",
  "ah",
  "ugu",
  "ugu horeeya",
  "daryeel",
  "caafimaadka",
  "dhakhtar",
  "isbitaal",
  "cuntada",
  "guri",
  "qoys",
  "caruur",
  "hooyo",
  "aabo",
  "walaal",
  "saaxiib",
];

const SOMALI_STT_BIAS_TEXT =
  "Waxaa socda wicitaan turjumaan telefoonka ah oo u dhexeeya af Ingiriisi iyo af Soomaali. " +
  "Labada dhinac waxay ku hadlaan weedho gaagaaban oo cad. Turjumaanku wuxuu bilaabaa: nabadgelyo, " +
  "mahadsanid, fadlan ku hadla weedho gaagaaban. Waxaa laga yaabaa in qofku yidhaahdo waxaan rabaa, " +
  "sidee tahay, waan fahmay, ma fahmin, waad mahadsantahay, turjumaan, caafimaad, dawlada, codsiga. " +
  "Bilingual English–Somali relay interpreting: parties alternate between English and Somali speech.";

/** Fixed English phrases + pair-specific interpreter lines for STT biasing. */
export function buildSonioxInterpreterContext(pair: LangPair): {
  general: { key: string; value: string }[];
  text: string;
  terms: string[];
} {
  const da = demonymFor(pair.a);
  const db = demonymFor(pair.b);
  const demonyms = [...new Set([da, db])].filter(Boolean);
  const somaliPair = pairIncludesSomali(pair);

  const lines: string[] = [
    "Telephone or video relay interpreting session.",
    "Interpreter opens with: you're through to the interpreter, or you are through to the interpreter.",
    "Thank you for calling the interpreter.",
    "Interpreter gives name and ID: my name is … and my ID number is …",
    "Please ask parties to speak in short clear phrases.",
    "Confidentiality: all information discussed will remain confidential.",
    "Use \"you're\" (you are) for connection lines, \"to\" (not too or two) before the interpreter language, \"their/there/they're\" only in grammatical context.",
  ];

  if (somaliPair) {
    lines.push(SOMALI_STT_BIAS_TEXT);
  }

  const terms: string[] = [];

  for (const d of demonyms) {
    terms.push(
      `you're through to the ${d} interpreter`,
      `you are through to the ${d} interpreter`,
      `You are through to the ${d} interpreter`,
      `thank you for calling the ${d} interpreter`,
      `through to the ${d} interpreter`,
      `the ${d} interpreter`,
    );
  }

  terms.push(
    "you're through to the interpreter",
    "you are through to the interpreter",
    "thank you for calling the interpreter",
    "thank you for calling",
    "Arabic interpreter",
    "Somali interpreter",
    "my interpreter ID number is",
    "my name is",
    "my ID number is",
    "my number is",
    "please speak in short clear phrases",
    "short clear phrases",
    "all information discussed will remain confidential",
    "remain confidential",
    "interpreter",
    "interpreting",
    "ID number",
    "SSI benefits",
    "Medicaid",
    "Social Security",
  );

  if (somaliPair) {
    terms.push(...SOMALI_STT_BIAS_TERMS);
  }

  const general: { key: string; value: string }[] = [
    { key: "domain", value: "Telephone and video interpreting" },
    { key: "topic", value: "Live interpreter call — introductions, confidentiality, turn-taking" },
  ];

  if (somaliPair) {
    general.push(
      { key: "language", value: "English and Somali" },
      {
        key: "instructions",
        value:
          "Bilingual English and Somali relay call. Transcribe Somali speech in Somali Latin orthography. " +
          "Transcribe English speech in English. Parties alternate languages.",
      },
      { key: "setting", value: "English–Somali telephone interpreting" },
    );
  }

  return {
    general,
    text: lines.join(" "),
    terms: [...new Set(terms)],
  };
}
