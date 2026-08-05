/**
 * Reusable Creative Studio asset registry — never regenerate these.
 * IDs are stable; player resolves motion/style from ID.
 */

export type AssetKind =
  | "textAnim"
  | "transition"
  | "statCard"
  | "ctaCard"
  | "lowerThird"
  | "iconAnim"
  | "bgLoop"
  | "sceneOpener"
  | "sceneCloser";

export type AssetDef = {
  id: string;
  kind: AssetKind;
  label: string;
  /** Soft motion recipe */
  motion: "fade" | "slideUp" | "slideLeft" | "scale" | "blurIn" | "zoom";
  duration: number;
};

function pack(kind: AssetKind, prefix: string, labels: string[], motionCycle: AssetDef["motion"][]): AssetDef[] {
  return labels.map((label, i) => ({
    id: `${prefix}_${String(i + 1).padStart(2, "0")}`,
    kind,
    label,
    motion: motionCycle[i % motionCycle.length]!,
    duration: 0.55 + (i % 3) * 0.08,
  }));
}

const MOTIONS: AssetDef["motion"][] = ["fade", "slideUp", "scale", "blurIn", "zoom", "slideLeft"];

export const TEXT_ANIMS = pack(
  "textAnim",
  "text",
  [
    "Soft fade reveal", "Slide up whisper", "Scale settle", "Blur to sharp",
    "Line cascade", "Word breathe", "Center lock", "Edge drift",
    "Opacity stack", "Quiet punch", "Wide kern fade", "Split line",
    "Hold then ease", "Depth lift", "Glass type", "Micro delay",
    "Horizon rise", "Soft mask", "Still frame", "Final settle",
  ],
  MOTIONS,
);

export const TRANSITIONS = pack(
  "transition",
  "tr",
  [
    "Crossfade soft", "Dip to black", "Dip to ink", "Blur wipe",
    "Zoom through", "Slide veil", "Opacity bridge", "Focus pull",
    "Light falloff", "Scene dissolve", "Hold breath", "Quiet cut",
    "Gradient veil", "Scale match", "Pan hint", "Soft iris",
    "Letterbox ease", "Depth shift", "Glow dim", "Clean join",
  ],
  MOTIONS,
);

export const STAT_CARDS = pack(
  "statCard",
  "stat",
  [
    "62 Languages", "10 Hours Saved", "100% Focus", "2 Hours Daily",
    "7 Days Free", "Zero Typing", "Live Turns", "Medical Ready",
    "Legal Ready", "Insurance Ready", "Gov Ready", "Business Ready",
    "Instant Clarity", "Speaker Turns", "ROI Clear", "Error Drop",
    "Always On", "Secure Call", "One Workspace", "Trust Signal",
  ],
  ["fade", "scale", "slideUp"],
);

export const CTA_CARDS = pack(
  "ctaCard",
  "cta",
  [
    "Start free trial", "Try 7 days", "Invite link", "Open workspace",
    "Book a demo", "See it live", "Join interpreters", "Begin today",
    "Unlock clarity", "Get access", "Start focused", "Claim trial",
    "Go to app", "Activate now", "Experience live", "Skip the typing",
    "Stay in the call", "Handle the words", "Launch trial", "Continue",
  ],
  ["fade", "slideUp", "scale"],
);

export const LOWER_THIRDS = pack(
  "lowerThird",
  "lt",
  Array.from({ length: 20 }, (_, i) => `Lower third ${i + 1}`),
  ["slideUp", "fade"],
);

export const ICON_ANIMS = pack(
  "iconAnim",
  "icon",
  Array.from({ length: 20 }, (_, i) => `Icon motion ${i + 1}`),
  ["fade", "scale"],
);

export const BG_LOOPS = pack(
  "bgLoop",
  "bg",
  [
    "Soft charcoal", "Blue mist", "Ink depth", "Quiet grid",
    "Glass fog", "Dawn fade", "Studio void", "Minimal wash",
    "Horizon glow", "Paper dark", "Cool slate", "Warm void",
    "Focus ring", "Soft vignette", "Pearl dark", "Steel hush",
    "Cloud ink", "Quiet stage", "Depth field", "Still night",
  ],
  ["zoom", "fade"],
);

export const SCENE_OPENERS = pack(
  "sceneOpener",
  "open",
  Array.from({ length: 20 }, (_, i) => `Scene opener ${i + 1}`),
  ["fade", "blurIn", "slideUp"],
);

export const SCENE_CLOSERS = pack(
  "sceneCloser",
  "close",
  Array.from({ length: 20 }, (_, i) => `Scene closer ${i + 1}`),
  ["fade", "scale", "blurIn"],
);

export const ASSET_LIBRARY = {
  textAnim: TEXT_ANIMS,
  transition: TRANSITIONS,
  statCard: STAT_CARDS,
  ctaCard: CTA_CARDS,
  lowerThird: LOWER_THIRDS,
  iconAnim: ICON_ANIMS,
  bgLoop: BG_LOOPS,
  sceneOpener: SCENE_OPENERS,
  sceneCloser: SCENE_CLOSERS,
} as const;

export function getAsset(id: string): AssetDef | undefined {
  for (const list of Object.values(ASSET_LIBRARY)) {
    const hit = list.find((a) => a.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Deterministic pick from a kind (stable per scene index). */
export function pickAsset(kind: AssetKind, salt: number): AssetDef {
  const list = ASSET_LIBRARY[kind];
  return list[Math.abs(salt) % list.length]!;
}
