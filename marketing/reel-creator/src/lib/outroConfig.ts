/**
 * Configurable Brand Outro — set once, lock, reuse on every generated reel.
 * Persisted as JSON under `interpreterai_outro_config` (localStorage).
 */

export const OUTRO_CONFIG_KEY = "interpreterai_outro_config";

export const OUTRO_MIN_SEC = 5;
export const OUTRO_MAX_SEC = 12;
export const OUTRO_DEFAULT_SEC = 10;

export type OutroConfig = {
  /** Outro segment length in seconds (5–12). */
  durationSec: number;
  /** Slogan line shown on the outro plate. */
  slogan: string;
  /** CTA pill text. */
  ctaText: string;
  /** Display URL (never spoken). */
  url: string;
  /** Spoken outro script (also drives timed captions). */
  voiceover: string;
  /** Locked = settings collapsed + treated as final. */
  locked: boolean;
};

export const DEFAULT_OUTRO_CONFIG: OutroConfig = {
  durationSec: OUTRO_DEFAULT_SEC,
  slogan: "Interpreter smarter. Work better.",
  ctaText: "Start Free — 7 Days · 2 Hours/Day",
  url: "app.interpreterai.org",
  voiceover: "InterpreterAI. Interpret smarter. Work better. Start your free trial today.",
  locked: false,
};

export function clampOutroDuration(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : OUTRO_DEFAULT_SEC;
  return Math.min(OUTRO_MAX_SEC, Math.max(OUTRO_MIN_SEC, Math.round(n)));
}

export function normalizeOutroConfig(raw: unknown): OutroConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<OutroConfig>;
  const str = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;
  return {
    durationSec: clampOutroDuration(r.durationSec),
    slogan: str(r.slogan, DEFAULT_OUTRO_CONFIG.slogan),
    ctaText: str(r.ctaText, DEFAULT_OUTRO_CONFIG.ctaText),
    url: str(r.url, DEFAULT_OUTRO_CONFIG.url),
    voiceover: str(r.voiceover, DEFAULT_OUTRO_CONFIG.voiceover),
    locked: Boolean(r.locked),
  };
}

export function loadOutroConfig(): OutroConfig {
  try {
    const raw = localStorage.getItem(OUTRO_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_OUTRO_CONFIG };
    return normalizeOutroConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_OUTRO_CONFIG };
  }
}

export function saveOutroConfig(config: OutroConfig): void {
  try {
    localStorage.setItem(OUTRO_CONFIG_KEY, JSON.stringify(normalizeOutroConfig(config)));
  } catch {
    /* storage full/unavailable — keep in-memory config */
  }
}
