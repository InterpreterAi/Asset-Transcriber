// In-memory language configuration managed by admin.
// Resets to defaults on server restart — acceptable for admin tooling.

export const ALL_LANGUAGES = [
  { value: "ar",    label: "Arabic" },
  { value: "bg",    label: "Bulgarian" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "hr",    label: "Croatian" },
  { value: "cs",    label: "Czech" },
  { value: "da",    label: "Danish" },
  { value: "nl",    label: "Dutch" },
  { value: "en",    label: "English" },
  { value: "fa",    label: "Persian (Farsi)" },
  { value: "fi",    label: "Finnish" },
  { value: "fr",    label: "French" },
  { value: "de",    label: "German" },
  { value: "el",    label: "Greek" },
  { value: "he",    label: "Hebrew" },
  { value: "hi",    label: "Hindi" },
  { value: "hu",    label: "Hungarian" },
  { value: "id",    label: "Indonesian" },
  { value: "it",    label: "Italian" },
  { value: "ja",    label: "Japanese" },
  { value: "ko",    label: "Korean" },
  { value: "ms",    label: "Malay" },
  { value: "nb",    label: "Norwegian" },
  { value: "pl",    label: "Polish" },
  { value: "pt",    label: "Portuguese" },
  { value: "ro",    label: "Romanian" },
  { value: "ru",    label: "Russian" },
  { value: "sk",    label: "Slovak" },
  { value: "es",    label: "Spanish" },
  { value: "sv",    label: "Swedish" },
  { value: "th",    label: "Thai" },
  { value: "tr",    label: "Turkish" },
  { value: "uk",    label: "Ukrainian" },
  { value: "ur",    label: "Urdu" },
  { value: "vi",    label: "Vietnamese" },
];

export interface LangConfig {
  enabledLanguages: string[];   // language value codes that are active
  defaultLangA:     string;
  defaultLangB:     string;
}

// Default: all languages enabled, en↔ar as default pair
const DEFAULT_ENABLED = ALL_LANGUAGES.map(l => l.value);

export let langConfig: LangConfig = {
  enabledLanguages: DEFAULT_ENABLED,
  defaultLangA:     "en",
  defaultLangB:     "ar",
};

export function updateLangConfig(updates: Partial<LangConfig>) {
  langConfig = { ...langConfig, ...updates };
}
