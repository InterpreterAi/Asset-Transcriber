/**
 * Fixed reveal windows for InterpreterAI outro (seconds).
 * Deterministic — same on preview and MP4 export.
 */

export const INTERPRETER_AI_OUTRO_DURATION_SEC = 5.0;
export const INTERPRETER_AI_OUTRO_FPS = 30;

export type OutroRevealWindow = { start: number; end: number };

export const INTERPRETER_AI_OUTRO_TIMELINE = {
  background: { start: 0, end: INTERPRETER_AI_OUTRO_DURATION_SEC },
  icon: { start: 0.15, end: 0.75 },
  wordmark: { start: 0.45, end: 1.1 },
  tagline1: { start: 0.85, end: 1.55 },
  tagline2: { start: 1.15, end: 1.8 },
  languages: { start: 1.65, end: 2.2 },
  cta: { start: 2.05, end: 2.75 },
  ctaSub: { start: 2.45, end: 3.1 },
  url: { start: 2.75, end: 3.4 },
  qr: { start: 2.8, end: 3.6 },
  hold: { start: 3.5, end: INTERPRETER_AI_OUTRO_DURATION_SEC },
} as const satisfies Record<string, OutroRevealWindow>;

/** Subtitle phrase windows — fallback when ElevenLabs timestamps unavailable. */
export const INTERPRETER_AI_OUTRO_SUBTITLE_WINDOWS: OutroRevealWindow[] = [
  { start: 0.0, end: 1.2 },
  { start: 0.9, end: 2.2 },
  { start: 1.7, end: 2.8 },
  { start: 2.4, end: 3.4 },
  { start: 3.1, end: 5.0 },
];

export function revealProgress(t: number, window: OutroRevealWindow): number {
  if (t <= window.start) return 0;
  if (t >= window.end) return 1;
  return (t - window.start) / (window.end - window.start);
}

export function easeOutCubic(p: number): number {
  const x = Math.max(0, Math.min(1, p));
  return 1 - Math.pow(1 - x, 3);
}

export type LayerMotion = {
  alpha: number;
  offsetY: number;
  scale: number;
  blurPx: number;
};

export function motionForWindow(t: number, window: OutroRevealWindow): LayerMotion {
  const p = easeOutCubic(revealProgress(t, window));
  return {
    alpha: p,
    offsetY: (1 - p) * 18,
    scale: 0.97 + p * 0.03,
    blurPx: (1 - p) * 8,
  };
}

/** CTA subtle breathe after fully visible. */
export function ctaBreathScale(t: number, window: OutroRevealWindow): number {
  const base = motionForWindow(t, window);
  if (base.alpha < 1) return base.scale;
  const breath = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.45);
  return 1 + breath * 0.012;
}
