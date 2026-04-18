/**
 * Localized short example for the glossary "preferred translation" placeholder.
 * Keys match workspace language selector values (BCP-47 style: en, ar, zh-CN, …).
 */
const CLAIM_NUMBER_EXAMPLE: Record<string, string> = {
  ar: "رقم المطالبة",
  bg: "Номер на претенция",
  "zh-CN": "理赔编号",
  "zh-TW": "理賠編號",
  hr: "Broj štete",
  cs: "Číslo škody",
  da: "Skadesagsnummer",
  nl: "Schadeclaimnummer",
  en: "Claim number",
  fa: "شماره خسارت",
  fi: "Vahinkonumero",
  fr: "Numéro de réclamation",
  de: "Schadennummer",
  el: "Αριθμός αξίωσης",
  he: "מספר תביעה",
  hi: "दावा संख्या",
  hu: "Kárigényszám",
  id: "Nomor klaim",
  it: "Numero sinistro",
  ja: "クレーム番号",
  ko: "청구 번호",
  ms: "Nombor tuntutan",
  nb: "Skadenummer",
  pl: "Numer szkody",
  pt: "Número do sinistro",
  ro: "Număr dosar daună",
  ru: "Номер претензии",
  sk: "Číslo škody",
  es: "Número de siniestro",
  sv: "Skadenummer",
  th: "หมายเลขเคลม",
  tr: "Hasar numarası",
  uk: "Номер претензії",
  ur: "دعویٰ نمبر",
  vi: "Số yêu cầu bồi thường",
};

function langBase(code: string): string {
  return code.split("-")[0]!.toLowerCase();
}

function pickExampleLangCode(langA: string, langB: string): string {
  const bA = langBase(langA);
  const bB = langBase(langB);
  // English ↔ X: show the example in the non-English language (familiar target wording).
  if (bA === "en" && bB !== "en") return langB;
  if (bB === "en" && bA !== "en") return langA;
  // No English in pair: use second selector (same convention as UI ordering).
  if (bA !== "en" && bB !== "en") return langB;
  return "en";
}

function lookupExample(code: string): string {
  if (CLAIM_NUMBER_EXAMPLE[code]) return CLAIM_NUMBER_EXAMPLE[code];
  const base = langBase(code);
  if (CLAIM_NUMBER_EXAMPLE[base]) return CLAIM_NUMBER_EXAMPLE[base];
  return CLAIM_NUMBER_EXAMPLE.en;
}

/** English label + localized example in quotes for the input placeholder only. */
export function glossaryPreferredTranslationPlaceholder(langA: string, langB: string): string {
  const code = pickExampleLangCode(langA, langB);
  const example = lookupExample(code);
  return `Preferred translation (e.g. "${example}")`;
}
