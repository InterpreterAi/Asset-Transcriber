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

/** Bidirectional language pair for workspace + hook display. */
export function buildLanguagePair(
  sourceCode: string,
  sourceLabel: string,
  targetCode: string,
  targetLabel: string,
): LanguagePair {
  return {
    sourceFlag: languageFlag(sourceCode),
    sourceLabel,
    targetFlag: languageFlag(targetCode),
    targetLabel,
  };
}

/** Legacy helper — English source ↔ target. */
export function buildLanguagePairFromTarget(
  targetCode: string,
  targetLabel: string,
): LanguagePair {
  return buildLanguagePair("en", "English", targetCode, targetLabel);
}
