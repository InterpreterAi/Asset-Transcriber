/**
 * Language codes supported in workspace language selectors — glossary entries
 * materialize every code at load (missing keys fall back to English).
 */
export const INTERPRETER_GLOSSARY_LANG_CODES = [
  "ar",
  "bg",
  "zh-CN",
  "zh-TW",
  "hr",
  "cs",
  "da",
  "nl",
  "en",
  "fa",
  "fi",
  "fr",
  "de",
  "el",
  "he",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "ms",
  "nb",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "es",
  "sv",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
] as const;

export type InterpreterGlossaryLangCode = (typeof INTERPRETER_GLOSSARY_LANG_CODES)[number];
