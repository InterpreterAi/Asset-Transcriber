/** Flag emoji per reel language code — globe fallback for unmapped codes. */

const FLAGS: Record<string, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  fr: "🇫🇷",
  de: "🇩🇪",
  "zh-CN": "🇨🇳",
  "zh-TW": "🇭🇰",
  ja: "🇯🇵",
  ko: "🇰🇷",
  ar: "🇸🇦",
  pt: "🇵🇹",
  ru: "🇷🇺",
  it: "🇮🇹",
  nl: "🇳🇱",
  pl: "🇵🇱",
  tr: "🇹🇷",
  hi: "🇮🇳",
  vi: "🇻🇳",
  tl: "🇵🇭",
  th: "🇹🇭",
  uk: "🇺🇦",
  el: "🇬🇷",
  he: "🇮🇱",
  id: "🇮🇩",
  ms: "🇲🇾",
  hu: "🇭🇺",
  cs: "🇨🇿",
  ro: "🇷🇴",
  sv: "🇸🇪",
  da: "🇩🇰",
  fi: "🇫🇮",
  nb: "🇳🇴",
  sw: "🇰🇪",
  am: "🇪🇹",
  bn: "🇧🇩",
  gu: "🇮🇳",
  pa: "🇮🇳",
  ta: "🇮🇳",
  te: "🇮🇳",
  kn: "🇮🇳",
  ml: "🇮🇳",
  mr: "🇮🇳",
  ur: "🇵🇰",
  fa: "🇮🇷",
  ps: "🇦🇫",
  sk: "🇸🇰",
  bg: "🇧🇬",
  hr: "🇭🇷",
  sr: "🇷🇸",
  sl: "🇸🇮",
  lt: "🇱🇹",
  lv: "🇱🇻",
  et: "🇪🇪",
  is: "🇮🇸",
  sq: "🇦🇱",
  mk: "🇲🇰",
  ga: "🇮🇪",
  mt: "🇲🇹",
};

export const GLOBE_FALLBACK = "🌐";

export function languageFlag(code: string): string {
  return FLAGS[code] ?? GLOBE_FALLBACK;
}

export type LanguagePair = {
  sourceFlag: string;
  sourceLabel: string;
  targetFlag: string;
  targetLabel: string;
};

/** US English ↔ target (globe fallback when no flag exists). */
export function buildLanguagePair(targetCode: string, targetLabel: string): LanguagePair {
  return {
    sourceFlag: FLAGS.en!,
    sourceLabel: "English",
    targetFlag: languageFlag(targetCode),
    targetLabel,
  };
}
