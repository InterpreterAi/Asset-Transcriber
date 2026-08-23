/**
 * Fixed 1080×1920 layout — matches reference outro plate.
 */

export const OUTRO_W = 1080;
export const OUTRO_H = 1920;

export const OUTRO_COLORS = {
  bgTop: "#04060c",
  bgMid: "#070b14",
  bgBottom: "#020308",
  cyan: "#20D4F0",
  cyanBright: "#5EEAD4",
  cyanGlow: "rgba(32, 212, 240, 0.45)",
  ink: "#FFFFFF",
  inkMuted: "rgba(255,255,255,0.72)",
  ctaLabel: "#061018",
  trail: "rgba(32, 212, 240, 0.55)",
  trailSoft: "rgba(32, 212, 240, 0.18)",
} as const;

export const OUTRO_LAYOUT = {
  icon: { x: 430, y: 350, w: 220, h: 220 },
  wordmark: { x: 90, y: 590, w: 900, h: 88, fontSize: 76, weight: 700 },
  tagline1: { x: 90, y: 688, w: 900, h: 52, fontSize: 36, weight: 500 },
  tagline2: { x: 90, y: 738, w: 900, h: 48, fontSize: 36, weight: 500 },
  languages: { x: 48, y: 828, w: 984, h: 44, fontSize: 28, weight: 700 },
  cta: { x: 265, y: 918, w: 550, h: 78, radius: 39, fontSize: 30, weight: 700 },
  ctaSub: { x: 180, y: 1012, w: 720, h: 36, fontSize: 22, weight: 500 },
  url: { x: 200, y: 1068, w: 680, h: 40, fontSize: 26, weight: 600 },
  qr: { x: 868, y: 1178, w: 140, h: 140 },
  subtitle: { x: 80, y: 1780, w: 920, h: 56, fontSize: 28, weight: 600 },
} as const;
