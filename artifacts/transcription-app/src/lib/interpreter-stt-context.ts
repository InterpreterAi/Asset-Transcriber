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

/** Fixed English phrases + pair-specific interpreter lines for STT biasing. */
export function buildSonioxInterpreterContext(pair: LangPair): {
  general: { key: string; value: string }[];
  text: string;
  terms: string[];
} {
  const da = demonymFor(pair.a);
  const db = demonymFor(pair.b);
  const demonyms = [...new Set([da, db])].filter(Boolean);

  const lines: string[] = [
    "Telephone or video relay interpreting session.",
    "Interpreter opens with: you're through to the interpreter, or you are through to the interpreter.",
    "Thank you for calling the interpreter.",
    "Interpreter gives name and ID: my name is … and my ID number is …",
    "Please ask parties to speak in short clear phrases.",
    "Confidentiality: all information discussed will remain confidential.",
    "Use \"you're\" (you are) for connection lines, \"to\" (not too or two) before the interpreter language, \"their/there/they're\" only in grammatical context.",
    "Speakers constantly give phone numbers, account numbers, dates, IDs, medical record numbers, and dollar amounts. Transcribe every digit and separator exactly as spoken (including pauses, dashes, slashes, and grouped digits). Prefer numerals when the speaker is reading numbers quickly.",
  ];

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
    // Verbatim numbers / phones — boosts recognition of digit-heavy speech (all languages).
    "phone number",
    "telephone number",
    "cell phone",
    "mobile number",
    "callback number",
    "call back number",
    "area code",
    "extension",
    "date of birth",
    "date of birth is",
    "Social Security number",
    "social security number",
    "account number",
    "case number",
    "claim number",
    "policy number",
    "member ID",
    "patient ID",
    "medical record number",
    "MRN",
    "room number",
    "suite number",
    "apartment number",
    "zip code",
    "ZIP code",
    "routing number",
    "credit card",
    "PIN number",
    "confirm the number",
    "read that back",
    "digit",
    "digits",
    "1-800-555-0100",
    "800-555-1212",
    "(555) 123-4567",
    "555-123-4567",
    "número de teléfono",
    "número de cuenta",
    "fecha de nacimiento",
    "número de caso",
    "numéro de téléphone",
    "numéro de compte",
    "Telefonnummer",
    "Kontonummer",
    "رقم الهاتف",
    "رقم الحساب",
  );

  return {
    general: [
      { key: "domain", value: "Telephone and video interpreting" },
      {
        key: "topic",
        value:
          "Live interpreter call — verbatim phone numbers, IDs, dates, and account numbers; introductions, confidentiality, turn-taking",
      },
      {
        key: "numbers",
        value:
          "Transcribe spoken digits and number phrases exactly as heard (phones, IDs, DOB, SSN, medical record, policy, claim). Preserve groupings and separators.",
      },
    ],
    text: lines.join(" "),
    terms: [...new Set(terms)],
  };
}
