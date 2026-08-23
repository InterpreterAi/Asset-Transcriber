/** Dynamic reel timeline — starts at Hook (no logo intro hold). */

import { buildReelExportFilename } from "@/lib/reelNaming";
import { LOCKED_OUTRO_MIN_SEC, outroDurationForVoSec } from "@/lib/universalBrandOutro";

export const WORDS_PER_SEC = 2.5; // ~150 wpm
export const SCENE_PADDING_SEC = 0.08;
/** No opening logo delay — Hook + VO at 0:00. */
export const INTRO_DURATION = 0;
/** Minimum Universal Brand Outro hold — extends with natural VO. */
export const OUTRO_MIN_HOLD = LOCKED_OUTRO_MIN_SEC;
export const LOCKED_OUTRO_SEC = LOCKED_OUTRO_MIN_SEC;
export const STING_GAP_AFTER_VO = 0.1;
/** Crossfade / scene change (~150ms). */
export const SCENE_TRANSITION_SEC = 0.18;
/**
 * Trailing silence baked into VO blobs so speech never clips.
 * Keep short — long tails read as dead air in premium SaaS ads.
 */
export const VO_TRAILING_SILENCE_SEC = 0.35;

export type ContentKey = "hook" | "problem" | "solution" | "result";

export type TimelineSegment = {
  id: string;
  start: number;
  end: number;
};

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function estimateSpeechSeconds(text: string, speed = 1): number {
  const words = countWords(text);
  if (words === 0) return 1.2;
  const base = words / WORDS_PER_SEC;
  const s = Math.max(0.5, Math.min(2, speed || 1));
  return Math.max(1.0, base / s);
}

export function formatEstBadge(seconds: number): string {
  return `Est: ${seconds.toFixed(1)}s`;
}

export type DurationMap = Partial<Record<ContentKey | "outro", number>>;

/**
 * Build content → outro timeline (no intro card).
 * Scene length = measured VO (incl. trailing silence) or word estimate + padding.
 * Outro follows natural VO length (never time-stretched).
 */
export function buildDynamicTimeline(opts: {
  texts: Record<ContentKey, string>;
  outroText?: string;
  speed?: number;
  measured?: DurationMap;
  brandStingEnabled?: boolean;
  brandStingDuration?: number;
}): { segments: TimelineSegment[]; total: number; contentDurations: Record<ContentKey, number> } {
  const speed = opts.speed ?? 1;

  const contentDurations = {} as Record<ContentKey, number>;
  const keys: ContentKey[] = ["hook", "problem", "solution", "result"];
  for (const k of keys) {
    const measured = opts.measured?.[k];
    const speech =
      measured && measured > 0.05
        ? measured
        : estimateSpeechSeconds(opts.texts[k] || "", speed) + VO_TRAILING_SILENCE_SEC * 0.35;
    contentDurations[k] = speech + SCENE_PADDING_SEC;
  }

  const segments: TimelineSegment[] = [];
  let t = 0;

  for (const k of keys) {
    const d = contentDurations[k];
    segments.push({ id: k, start: t, end: t + d });
    t += d;
  }

  // Full locked outro VO must finish — duration follows measured speech (never clip).
  void opts.brandStingEnabled;
  void opts.brandStingDuration;
  const outroMeasured =
    opts.measured?.outro && opts.measured.outro > 0.05 ? opts.measured.outro : 0;
  const outroEstimate = estimateSpeechSeconds(opts.outroText || "", 1) + 1.2;
  const outroTotal = outroDurationForVoSec(outroMeasured || outroEstimate);
  segments.push({ id: "outro", start: t, end: t + outroTotal });
  t += outroTotal;

  return { segments, total: t, contentDurations };
}

/** Brand sting disabled on Universal Brand Outro (no logo hit). */
export function brandStingTimes(
  _segments: TimelineSegment[],
  _outroVoSec: number,
  _enabled: boolean,
): number[] {
  return [];
}

export function sanitizeFilenamePart(raw: string): string {
  return raw
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/_+/g, "_") || "Reel";
}

export function buildExportFilename(scenario: string, language: string): string {
  return buildReelExportFilename({ storyline: scenario, language });
}
