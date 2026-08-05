/** Frame-synced kinetic captions from real word timestamps (Reel Builder only). */

export const KINETIC_ACTIVE_BLUE = "#0070F3";
export const KINETIC_IDLE_WHITE = "#FFFFFF";
export const CAPTION_SIDE_PAD = 80; // px on 1080-wide canvas
export const WORDS_ON_SCREEN_MIN = 2;
export const WORDS_ON_SCREEN_MAX = 4;

export type TimedWord = {
  word: string;
  start: number;
  end: number;
  index: number;
};

export type CaptionWindow = {
  words: TimedWord[];
  /** Absolute index of the spoken word (in full list). */
  activeIndex: number;
  /** Index within the visible window. */
  activeLocal: number;
};

export function splitWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Normalize API word rows into indexed TimedWord[]. */
export function normalizeWordTimestamps(
  words: Array<{ word?: string; start?: number; end?: number }> | null | undefined,
): TimedWord[] {
  if (!words?.length) return [];
  return words
    .map((w, index) => ({
      word: String(w.word ?? "").trim(),
      start: typeof w.start === "number" && Number.isFinite(w.start) ? Math.max(0, w.start) : 0,
      end: typeof w.end === "number" && Number.isFinite(w.end) ? Math.max(0, w.end) : 0,
      index,
    }))
    .filter((w) => w.word.length > 0)
    .map((w, index) => ({
      ...w,
      index,
      end: w.end > w.start ? w.end : w.start + 0.08,
    }));
}

/** Even estimate when timestamps are missing (fallback only). */
export function estimateTimedWords(text: string, durationSec: number): TimedWord[] {
  const parts = splitWords(text);
  if (parts.length === 0) return [];
  const d = Math.max(0.4, durationSec);
  const weights = parts.map((w) => Math.max(1, w.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "").length || 1));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return parts.map((word, index) => {
    const span = (weights[index]! / sum) * d;
    const start = t;
    const end = index === parts.length - 1 ? d : t + span;
    t = end;
    return { word, start, end, index };
  });
}

/**
 * Scale word timings so the last end maps to speechDuration
 * (useful when OpenAI estimates don't match decoded audio length).
 */
export function scaleWordsToDuration(words: TimedWord[], speechDuration: number): TimedWord[] {
  if (words.length === 0 || speechDuration <= 0.05) return words;
  const last = words[words.length - 1]!.end;
  if (last <= 0.05) return words;
  const factor = speechDuration / last;
  if (Math.abs(factor - 1) < 0.02) return words;
  return words.map((w) => ({
    ...w,
    start: w.start * factor,
    end: w.end * factor,
  }));
}

/** Active spoken word at local audio time (seconds into segment VO). */
export function activeWordAt(words: TimedWord[], localTime: number): TimedWord | null {
  if (words.length === 0) return null;
  if (localTime < words[0]!.start) return words[0]!;
  for (const w of words) {
    if (localTime >= w.start && localTime < w.end) return w;
  }
  // Between words — pick nearest prior
  for (let i = words.length - 1; i >= 0; i--) {
    if (localTime >= words[i]!.start) return words[i]!;
  }
  return words[words.length - 1]!;
}

/**
 * Show only 2–4 words on screen; window advances with the spoken word.
 * Chunk size adapts slightly to keep lines balanced.
 */
export function captionWindowAt(
  words: TimedWord[],
  localTime: number,
  preferredSize = 3,
): CaptionWindow | null {
  if (words.length === 0) return null;
  const active = activeWordAt(words, localTime);
  if (!active) return null;
  const size = Math.min(
    WORDS_ON_SCREEN_MAX,
    Math.max(WORDS_ON_SCREEN_MIN, preferredSize),
  );
  const start = Math.floor(active.index / size) * size;
  const slice = words.slice(start, Math.min(words.length, start + size));
  const activeLocal = slice.findIndex((w) => w.index === active.index);
  return {
    words: slice,
    activeIndex: active.index,
    activeLocal: activeLocal < 0 ? 0 : activeLocal,
  };
}

/**
 * Dynamic caption size for 9:16 (1080×1920) so text never overflows.
 * `canvasWidth` is export-space width (1080 or 1920).
 */
export function captionFontSizePx(wordCount: number, canvasWidth: number): number {
  const avail = Math.max(320, canvasWidth - CAPTION_SIDE_PAD * 2);
  // Target: fit ~wordCount words of avg 5 glyphs with letter-spacing
  const perWordBudget = avail / Math.max(2, wordCount);
  let size = perWordBudget * 0.92;
  if (wordCount <= 2) size = Math.min(104, size);
  else if (wordCount === 3) size = Math.min(92, size);
  else size = Math.min(78, size);
  return Math.max(44, Math.round(size));
}

export const REEL_CAPTION_FONT =
  '"Plus Jakarta Sans", Inter, system-ui, -apple-system, sans-serif';
