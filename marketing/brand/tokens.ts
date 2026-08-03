/**
 * InterpreterAI marketing brand tokens.
 * Logo paths point at existing files in `./assets/` — do not regenerate.
 */

export const brandColors = {
  primary: "#2563EB",
  primarySoft: "#EFF6FF",
  accent: "#22D3EE",
  live: "#DC2626",
  liveSoft: "rgba(220, 38, 38, 0.28)",
  ink: "#0F172A",
  inkMuted: "#64748B",
  paper: "#F8FAFC",
  night: "#02050B",
  nightPanel: "#0B1220",
  nightElevated: "#080D17",
  white: "#FFFFFF",
  cta: "#22D3EE",
} as const;

export const brandFonts = {
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Inter, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const brandSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
} as const;

export const brandRadii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
  frame: 26,
} as const;

/**
 * Existing logo assets (exact files in `assets/`).
 * When serving from the app’s `/brand/` public copy, paths match 1:1.
 * Override via `BrandLogo` `src` / `assetBase` if needed.
 */
export const brandAssets = {
  logoLightSvg: "interpreterai-logo-light.svg",
  logoDarkSvg: "interpreterai-logo-dark.svg",
  logoLightPng: "interpreterai-logo-light.png",
  logoDarkPng: "interpreterai-logo-dark.png",
  markLightSvg: "interpreterai-mark-light.svg",
  markDarkSvg: "interpreterai-mark-dark.svg",
  markLightPng: "interpreterai-mark-light.png",
  markDarkPng: "interpreterai-mark-dark.png",
} as const;

/** Default public URL prefix when assets are copied to `public/brand/`. */
export const DEFAULT_ASSET_BASE = "/brand";

/** Official referral / invite URL for outros & CTA cards. */
export const BRAND_REFERRAL_URL =
  "https://app.interpreterai.org/invite?ref=1&u=admin";

export const BRAND_SITE_URL = "https://app.interpreterai.org";

/** Vertical safe padding for TikTok / Reels / Shorts (9:16). */
export const REEL_SAFE_AREA = {
  topPx: 96,
  bottomPx: 140,
  sidePx: 24,
} as const;

export type BrandTheme = "dark" | "light";
