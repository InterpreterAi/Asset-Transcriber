/**
 * InterpreterAI marketing brand tokens — single source for reels / overlays.
 * Keep in sync with `STYLE_GUIDE.md`.
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

/** Public asset paths (served from `/brand/...`). */
export const brandAssets = {
  logoLightSvg: "/brand/interpreterai-logo-light.svg",
  logoDarkSvg: "/brand/interpreterai-logo-dark.svg",
  logoLightPng: "/brand/interpreterai-logo-light.png",
  logoDarkPng: "/brand/interpreterai-logo-dark.png",
  markLightSvg: "/brand/interpreterai-mark-light.svg",
  markDarkSvg: "/brand/interpreterai-mark-dark.svg",
  markLightPng: "/brand/interpreterai-mark-light.png",
  markDarkPng: "/brand/interpreterai-mark-dark.png",
} as const;

export type BrandTheme = "dark" | "light";
