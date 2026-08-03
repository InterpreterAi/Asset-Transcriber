/** Dynamic reel timeline from word-count estimates or measured VO durations. */

export const WORDS_PER_SEC = 2.5; // ~150 wpm
/** Minimal post-VO breath — scenes cut as soon as speech ends. */
export const SCENE_PADDING_SEC = 0.2;
export const INTRO_DURATION = 2.0;
export const OUTRO_MIN_HOLD = 3.2;
/** Gap after outro slogan VO before brand sting (no overlap). */
export const STING_GAP_AFTER_VO = 0.15;

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

/** Estimated spoken duration (seconds) at ~150 wpm, adjusted by TTS speed. */
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
 * Build intro → content → outro timeline.
 * Content scene length = (measured VO || word estimate) + padding.
 * Outro: VO first, then brand sting after a short gap (no overlap with CTA VO).
 */
export function buildDynamicTimeline(opts: {
  texts: Record<ContentKey, string>;
  outroText?: string;
  speed?: number;
  /** Measured VO durations (seconds) when available */
  measured?: DurationMap;
  brandStingEnabled?: boolean;
  brandStingDuration?: number;
}): { segments: TimelineSegment[]; total: number; contentDurations: Record<ContentKey, number> } {
  const speed = opts.speed ?? 1;
  const stingDur = opts.brandStingEnabled ? (opts.brandStingDuration ?? 1.2) : 0;

  const contentDurations = {} as Record<ContentKey, number>;
  const keys: ContentKey[] = ["hook", "problem", "solution", "result"];
  for (const k of keys) {
    const measured = opts.measured?.[k];
    // Prefer exact VO length; only use word estimate when VO not generated yet.
    const speech =
      measured && measured > 0.05
        ? measured
        : estimateSpeechSeconds(opts.texts[k] || "", speed);
    contentDurations[k] = speech + SCENE_PADDING_SEC;
  }

  const segments: TimelineSegment[] = [];
  let t = 0;
  segments.push({ id: "intro", start: t, end: t + INTRO_DURATION });
  t += INTRO_DURATION;

  for (const k of keys) {
    const d = contentDurations[k];
    segments.push({ id: k, start: t, end: t + d });
    t += d;
  }

  const outroVo =
    opts.measured?.outro && opts.measured.outro > 0.05
      ? opts.measured.outro
      : estimateSpeechSeconds(opts.outroText || "", speed);
  // Slogan VO finishes first; brand sting schedules after STING_GAP_AFTER_VO (no overlap).
  const outroBody = Math.max(OUTRO_MIN_HOLD, outroVo + SCENE_PADDING_SEC);
  const outroTotal = outroBody + (stingDur > 0 ? STING_GAP_AFTER_VO + stingDur : 0.25);
  segments.push({ id: "outro", start: t, end: t + outroTotal });
  t += outroTotal;

  return { segments, total: t, contentDurations };
}

/** When brand sting should fire on the timeline (after outro VO, not on top of it). */
export function brandStingTimes(
  segments: TimelineSegment[],
  outroVoSec: number,
  enabled: boolean,
): number[] {
  if (!enabled) return [];
  const intro = segments.find((s) => s.id === "intro");
  const outro = segments.find((s) => s.id === "outro");
  const times: number[] = [];
  if (intro) times.push(intro.start + 0.08);
  if (outro) {
    const afterVo = outro.start + Math.min(outroVoSec + STING_GAP_AFTER_VO, outro.end - outro.start - 0.2);
    times.push(afterVo);
  }
  return times;
}

export function sanitizeFilenamePart(raw: string): string {
  return raw
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/_+/g, "_") || "Reel";
}

export function buildExportFilename(scenario: string, languageLabel: string): string {
  const s = sanitizeFilenamePart(scenario);
  const l = sanitizeFilenamePart(languageLabel);
  return `${s}_${l}_Reel.mp4`;
}
