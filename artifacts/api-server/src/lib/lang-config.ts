// In-memory language configuration managed by admin.
// Resets to defaults on server restart — acceptable for admin tooling.
//
// Interpreter AI — **Libre stack**: these codes match a typical 20-language
// LibreTranslate loadout (en, ar, zh, es, …). Override enabled set via admin UI.

export const ALL_LANGUAGES = [
  { value: "en",    label: "English" },
  { value: "ar",    label: "Arabic" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "es",    label: "Spanish" },
  { value: "fr",    label: "French" },
  { value: "hi",    label: "Hindi" },
  { value: "pt",    label: "Portuguese" },
  { value: "ru",    label: "Russian" },
  { value: "ja",    label: "Japanese" },
  { value: "de",    label: "German" },
  { value: "ko",    label: "Korean" },
  { value: "tr",    label: "Turkish" },
  { value: "it",    label: "Italian" },
  { value: "id",    label: "Indonesian" },
  { value: "vi",    label: "Vietnamese" },
  { value: "nl",    label: "Dutch" },
  { value: "pl",    label: "Polish" },
  { value: "th",    label: "Thai" },
  { value: "fa",    label: "Persian (Farsi)" },
  { value: "ur",    label: "Urdu" },
];

export interface LangConfig {
  enabledLanguages: string[];   // language value codes that are active
  defaultLangA:     string;
  defaultLangB:     string;
}

const DEFAULT_ENABLED = ALL_LANGUAGES.map(l => l.value);

export let langConfig: LangConfig = {
  enabledLanguages: DEFAULT_ENABLED,
  defaultLangA:     "en",
  defaultLangB:     "ar",
};

export function updateLangConfig(updates: Partial<LangConfig>) {
  langConfig = { ...langConfig, ...updates };
}
