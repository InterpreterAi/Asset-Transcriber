/**
 * Marketing language catalog (62) + badge helpers.
 * Change any pair with `formatLangBadge("en", "es")` or `<LanguageBadge from="en" to="hi" />`.
 */

export type BrandLanguage = {
  readonly code: string;
  /** Short badge label (EN, ES, ZH, …). */
  readonly badge: string;
  readonly name: string;
};

/** Full InterpreterAI language set (62) — matches product catalog. */
export const BRAND_LANGUAGES: readonly BrandLanguage[] = [
  { code: "ar", badge: "AR", name: "Arabic" },
  { code: "bg", badge: "BG", name: "Bulgarian" },
  { code: "zh-CN", badge: "ZH", name: "Chinese (Simplified)" },
  { code: "zh-TW", badge: "ZH", name: "Chinese (Traditional)" },
  { code: "hr", badge: "HR", name: "Croatian" },
  { code: "cs", badge: "CS", name: "Czech" },
  { code: "da", badge: "DA", name: "Danish" },
  { code: "nl", badge: "NL", name: "Dutch" },
  { code: "en", badge: "EN", name: "English" },
  { code: "fa", badge: "FA", name: "Persian (Farsi)" },
  { code: "fi", badge: "FI", name: "Finnish" },
  { code: "fr", badge: "FR", name: "French" },
  { code: "de", badge: "DE", name: "German" },
  { code: "el", badge: "EL", name: "Greek" },
  { code: "he", badge: "HE", name: "Hebrew" },
  { code: "hi", badge: "HI", name: "Hindi" },
  { code: "hu", badge: "HU", name: "Hungarian" },
  { code: "id", badge: "ID", name: "Indonesian" },
  { code: "it", badge: "IT", name: "Italian" },
  { code: "ja", badge: "JA", name: "Japanese" },
  { code: "ko", badge: "KO", name: "Korean" },
  { code: "ms", badge: "MS", name: "Malay" },
  { code: "nb", badge: "NB", name: "Norwegian" },
  { code: "pl", badge: "PL", name: "Polish" },
  { code: "pt", badge: "PT", name: "Portuguese" },
  { code: "ro", badge: "RO", name: "Romanian" },
  { code: "ru", badge: "RU", name: "Russian" },
  { code: "sk", badge: "SK", name: "Slovak" },
  { code: "so", badge: "SO", name: "Somali" },
  { code: "es", badge: "ES", name: "Spanish" },
  { code: "sv", badge: "SV", name: "Swedish" },
  { code: "th", badge: "TH", name: "Thai" },
  { code: "tr", badge: "TR", name: "Turkish" },
  { code: "uk", badge: "UK", name: "Ukrainian" },
  { code: "ur", badge: "UR", name: "Urdu" },
  { code: "vi", badge: "VI", name: "Vietnamese" },
  { code: "af", badge: "AF", name: "Afrikaans" },
  { code: "sq", badge: "SQ", name: "Albanian" },
  { code: "az", badge: "AZ", name: "Azerbaijani" },
  { code: "eu", badge: "EU", name: "Basque" },
  { code: "be", badge: "BE", name: "Belarusian" },
  { code: "bn", badge: "BN", name: "Bengali" },
  { code: "bs", badge: "BS", name: "Bosnian" },
  { code: "ca", badge: "CA", name: "Catalan" },
  { code: "et", badge: "ET", name: "Estonian" },
  { code: "gl", badge: "GL", name: "Galician" },
  { code: "gu", badge: "GU", name: "Gujarati" },
  { code: "kn", badge: "KN", name: "Kannada" },
  { code: "kk", badge: "KK", name: "Kazakh" },
  { code: "lv", badge: "LV", name: "Latvian" },
  { code: "lt", badge: "LT", name: "Lithuanian" },
  { code: "mk", badge: "MK", name: "Macedonian" },
  { code: "ml", badge: "ML", name: "Malayalam" },
  { code: "mr", badge: "MR", name: "Marathi" },
  { code: "pa", badge: "PA", name: "Punjabi" },
  { code: "sr", badge: "SR", name: "Serbian" },
  { code: "sl", badge: "SL", name: "Slovenian" },
  { code: "sw", badge: "SW", name: "Swahili" },
  { code: "tl", badge: "TL", name: "Tagalog" },
  { code: "ta", badge: "TA", name: "Tamil" },
  { code: "te", badge: "TE", name: "Telugu" },
  { code: "cy", badge: "CY", name: "Welsh" },
] as const;

export const BRAND_LANGUAGE_COUNT = BRAND_LANGUAGES.length;

export function resolveBrandLanguage(code: string): BrandLanguage {
  const key = (code || "").trim();
  if (key === "zh") {
    return BRAND_LANGUAGES.find((l) => l.code === "zh-CN")!;
  }
  const exact = BRAND_LANGUAGES.find((l) => l.code === key);
  if (exact) return exact;
  const base = key.split("-")[0]!.toLowerCase();
  const byBase = BRAND_LANGUAGES.find(
    (l) => l.code.split("-")[0]!.toLowerCase() === base,
  );
  if (byBase) return byBase;
  return {
    code: key,
    badge: key.slice(0, 2).toUpperCase() || "??",
    name: key,
  };
}

/** e.g. formatLangBadge("en", "es") → "EN→ES" */
export function formatLangBadge(from: string, to: string, arrow = "→"): string {
  return `${resolveBrandLanguage(from).badge}${arrow}${resolveBrandLanguage(to).badge}`;
}

/** Common reel pairs (quick picks). Any of the 62 langs work via `from`/`to`. */
export const COMMON_LANG_PAIRS = [
  { from: "en", to: "es", label: "EN→ES" },
  { from: "en", to: "ar", label: "EN→AR" },
  { from: "en", to: "zh", label: "EN→ZH" },
  { from: "en", to: "fr", label: "EN→FR" },
  { from: "en", to: "pt", label: "EN→PT" },
  { from: "en", to: "ru", label: "EN→RU" },
  { from: "en", to: "uk", label: "EN→UK" },
  { from: "en", to: "hi", label: "EN→HI" },
  { from: "en", to: "de", label: "EN→DE" },
  { from: "en", to: "it", label: "EN→IT" },
] as const;
