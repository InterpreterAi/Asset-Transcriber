/**
 * InterpreterAI Reel Engine V2 — permanent design system.
 * Same motion, type, color, spacing, CTA, outro on every reel.
 * Do not customize per campaign.
 */

export const BRAND = {
  name: "InterpreterAI",
  tagline1: "Stay focused on the conversation.",
  tagline2: "We'll handle the words.",
  inviteUrl: "https://app.interpreterai.org",
  domains: ["Medical", "Legal", "Insurance", "Government", "Business"] as const,
  languagesLine: "Supports 62 languages",
  ctaPrimary: "Start Free Trial",
  ctaSecondary: "app.interpreterai.org",
} as const;

/** Canvas is always 1080×1920 vertical commercial. */
export const CANVAS = {
  width: 1080,
  height: 1920,
  safePadX: 96,
  safePadY: 120,
} as const;

/**
 * Soft, minimal palette — premium SaaS, not neon / gamer.
 * White type on near-black with restrained blue accent.
 */
export const COLORS = {
  bg: "#05070C",
  bgElevated: "#0B0F17",
  ink: "#FFFFFF",
  inkMuted: "rgba(255,255,255,0.62)",
  inkFaint: "rgba(255,255,255,0.38)",
  accent: "#3B82F6",
  accentSoft: "rgba(59,130,246,0.18)",
  glass: "rgba(255,255,255,0.06)",
  glassBorder: "rgba(255,255,255,0.12)",
  shadow: "rgba(0,0,0,0.45)",
  gradient:
    "radial-gradient(ellipse 80% 55% at 50% 30%, rgba(59,130,246,0.14) 0%, transparent 55%), #05070C",
} as const;

export const TYPE = {
  /** Huge hook / hero */
  display: {
    family: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
    weight: 700,
    size: 92,
    tracking: "-0.04em",
    lineHeight: 1.05,
  },
  /** Scene body */
  title: {
    family: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
    weight: 600,
    size: 56,
    tracking: "-0.03em",
    lineHeight: 1.15,
  },
  /** Supporting */
  body: {
    family: 'Inter, system-ui, sans-serif',
    weight: 500,
    size: 32,
    tracking: "-0.01em",
    lineHeight: 1.35,
  },
  /** Micro labels */
  micro: {
    family: 'Inter, system-ui, sans-serif',
    weight: 600,
    size: 18,
    tracking: "0.08em",
    lineHeight: 1.2,
  },
} as const;

/** Slow, soft motion only — fade / slide / scale / blur / zoom. */
export const MOTION = {
  fadeIn: 0.55,
  fadeOut: 0.4,
  slideY: 28,
  scaleFrom: 0.97,
  scaleTo: 1,
  blurFrom: 8,
  cameraZoom: 1.04,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  sceneCrossfade: 0.35,
} as const;

/** Fixed commercial timing skeleton (seconds). */
export const TIMING = {
  introMax: 1.0,
  hook: { start: 1.0, end: 3.0 },
  problem: { start: 3.0, end: 7.0 },
  product: { start: 7.0, end: 18.0 },
  benefits: { start: 18.0, end: 26.0 },
  outro: { start: 26.0, end: 30.0 },
  total: 30,
} as const;

export const CAPTIONS = {
  wordsOnScreen: 3,
  activeColor: COLORS.ink,
  idleColor: "rgba(255,255,255,0.45)",
  underline: COLORS.accent,
  fontSize: 44,
  fontWeight: 650,
} as const;
