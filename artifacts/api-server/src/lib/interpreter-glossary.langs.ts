/**
 * Workspace language codes (35) used for glossary `translations` and restore.
 * Authoring convention: `translations.en` is the canonical English gloss (full
 * phrase when the JSON key is an acronym). Missing keys in JSON are filled at
 * load with that English string so every target resolves; prefer adding real
 * target-language strings in data files for production quality.
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
