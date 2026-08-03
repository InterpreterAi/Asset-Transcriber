/**
 * InterpreterAI Brand Pack — one import for every future reel.
 *
 *   import { BrandPack } from "../marketing/brand";
 *   // or named exports from the same entry
 *
 * Marketing-only. Not wired into production workspace or Record Mode.
 */

export { brandAssets, brandColors, brandFonts, brandRadii, brandSpacing } from "./tokens";
export {
  BRAND_REFERRAL_URL,
  BRAND_SITE_URL,
  DEFAULT_ASSET_BASE,
  REEL_SAFE_AREA,
} from "./tokens";
export type { BrandTheme } from "./tokens";

export {
  BRAND_LANGUAGES,
  BRAND_LANGUAGE_COUNT,
  COMMON_LANG_PAIRS,
  formatLangBadge,
  resolveBrandLanguage,
} from "./languages";
export type { BrandLanguage } from "./languages";

export { LOWER_THIRD_PRESETS, LOWER_THIRD_PRESET_LIST } from "./presets";
export type { LowerThirdPresetKey } from "./presets";

export { cn } from "./cn";

export { BrandLogo } from "./components/BrandLogo";
export {
  BrandIntro,
  BRAND_INTRO_COPY,
  BRAND_INTRO_DURATION_MS,
} from "./components/BrandIntro";
export {
  BrandOutro,
  BRAND_OUTRO_COPY,
  BRAND_OUTRO_DURATION_MS,
} from "./components/BrandOutro";
export {
  LowerThird,
  LowerThirds,
} from "./components/LowerThird";
export {
  LanguageBadge,
  LanguageBadges,
} from "./components/LanguageBadge";
export { CtaCard, CTA_CARD_COPY } from "./components/CtaCard";
export { LiveBadge } from "./components/LiveBadge";
export {
  BrandTransition,
  brandTransitionClassNames,
  brandTransitionVariants,
} from "./components/transitions";
export type { BrandTransitionName } from "./components/transitions";
export { SoftReveal, BRAND_EASE } from "./components/SoftReveal";

import { BrandLogo } from "./components/BrandLogo";
import { BrandIntro } from "./components/BrandIntro";
import { BrandOutro } from "./components/BrandOutro";
import { LowerThird, LowerThirds } from "./components/LowerThird";
import { LanguageBadge, LanguageBadges } from "./components/LanguageBadge";
import { CtaCard } from "./components/CtaCard";
import { LiveBadge } from "./components/LiveBadge";
import { BrandTransition } from "./components/transitions";
import { SoftReveal } from "./components/SoftReveal";
import {
  brandAssets,
  brandColors,
  BRAND_REFERRAL_URL,
  BRAND_SITE_URL,
  REEL_SAFE_AREA,
} from "./tokens";
import { COMMON_LANG_PAIRS, formatLangBadge, BRAND_LANGUAGES } from "./languages";
import { LOWER_THIRD_PRESETS } from "./presets";

/** Single object import for every reel overlay. */
export const BrandPack = {
  Logo: BrandLogo,
  Intro: BrandIntro,
  Outro: BrandOutro,
  LowerThird,
  LowerThirds,
  LanguageBadge,
  LanguageBadges,
  CtaCard,
  LiveBadge,
  Transition: BrandTransition,
  SoftReveal,
  assets: brandAssets,
  colors: brandColors,
  referralUrl: BRAND_REFERRAL_URL,
  siteUrl: BRAND_SITE_URL,
  reelSafeArea: REEL_SAFE_AREA,
  languages: BRAND_LANGUAGES,
  commonPairs: COMMON_LANG_PAIRS,
  formatLangBadge,
  lowerThirdPresets: LOWER_THIRD_PRESETS,
} as const;

export default BrandPack;
