/** Frame-synced kinetic captions from real word timestamps (Reel Builder only). */

export const KINETIC_ACTIVE_BLUE = "#0070F3";
export const KINETIC_IDLE_WHITE = "#FFFFFF";
export const CAPTION_SIDE_PAD = 100; // px on 1080-wide canvas
export const WORDS_ON_SCREEN_MIN = 2;
export const WORDS_ON_SCREEN_MAX = 4;

/** Hook / clip VO — up to 6 words per phrase window, split across 2 lines in UI. */
export const CLIP_CAPTION_MAX_WORDS = 6;
export const CLIP_CAPTION_LINE_MAX_WORDS = 3;

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
  /** Phrase start/end — hide captions outside this range. */
  phraseStart: number;
  phraseEnd: number;
};

export function splitWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Strip alignment artifacts — never show ellipsis-only tokens. */
export function cleanCaptionToken(raw: string): string {
  return raw
    .replace(/^[…\.]+|[…\.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize API word rows into indexed TimedWord[]. */
export function normalizeWordTimestamps(
  words: Array<{ word?: string; start?: number; end?: number }> | null | undefined,
): TimedWord[] {
  if (!words?.length) return [];
  return words
    .map((w, index) => ({
      word: cleanCaptionToken(String(w.word ?? "")),
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
  if (localTime < words[0]!.start) return null;
  for (const w of words) {
    if (localTime >= w.start && localTime < w.end) return w;
  }
  for (let i = words.length - 1; i >= 0; i--) {
    if (localTime >= words[i]!.start) return words[i]!;
  }
  return null;
}

const PAUSE_BREAK_SEC = 0.26;

/** Group timed words into natural phrase/sentence chunks for premium ad captions. */
export function buildPhraseChunks(words: TimedWord[]): TimedWord[][] {
  if (words.length === 0) return [];
  const chunks: TimedWord[][] = [];
  let current: TimedWord[] = [words[0]!];

  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1]!;
    const w = words[i]!;
    const gap = w.start - prev.end;
    const prevEndsSentence = /[.!?؟。]$/.test(prev.word);
    const pauseBreak = gap >= PAUSE_BREAK_SEC;

    if (prevEndsSentence || pauseBreak) {
      chunks.push(current);
      current = [w];
    } else {
      current.push(w);
    }
  }
  chunks.push(current);
  return chunks;
}

/**
 * Show one complete phrase at a time — synced to actual audio timestamps.
 * No arbitrary word windows, no ellipsis, nothing before/after speech.
 */
export function captionWindowAt(
  words: TimedWord[],
  localTime: number,
  _preferredSize = 3,
): CaptionWindow | null {
  if (words.length === 0) return null;

  const phrases = buildPhraseChunks(words);
  for (const phrase of phrases) {
    const phraseStart = phrase[0]!.start;
    const phraseEnd = phrase[phrase.length - 1]!.end;
    if (localTime + 0.015 < phraseStart || localTime > phraseEnd + 0.04) continue;

    const active = activeWordAt(phrase, localTime) ?? phrase[0]!;
    const activeLocal = phrase.findIndex((w) => w.index === active.index);
    return {
      words: phrase,
      activeIndex: active.index,
      activeLocal: activeLocal < 0 ? 0 : activeLocal,
      phraseStart,
      phraseEnd,
    };
  }
  return null;
}

/** Split timed words into fixed single-line chunks (max N words each). */
export function buildClipLineChunks(
  words: TimedWord[],
  maxWords = CLIP_CAPTION_MAX_WORDS,
): TimedWord[][] {
  if (words.length === 0) return [];
  const n = Math.max(1, maxWords);
  const chunks: TimedWord[][] = [];
  for (let i = 0; i < words.length; i += n) {
    chunks.push(words.slice(i, i + n));
  }
  return chunks;
}

/** Split a caption chunk into 1–2 lines (max 3 words each) — no ellipsis. */
export function layoutClipCaptionLines(
  words: TimedWord[],
  lineMax = CLIP_CAPTION_LINE_MAX_WORDS,
): TimedWord[][] {
  if (words.length === 0) return [];
  if (words.length <= lineMax) return [words];
  const firstCount =
    words.length <= lineMax * 2
      ? Math.min(lineMax, Math.max(1, words.length - 1))
      : lineMax;
  const line1 = words.slice(0, firstCount);
  const line2 = words.slice(firstCount);
  if (line2.length === 0) return [line1];
  if (line2.length > lineMax) return [line1, line2.slice(0, lineMax)];
  return [line1, line2];
}

/** Map alignment tokens → original script words; keeps VO timing, shows what's on screen. */
export function mapCaptionWordsToScript(
  alignmentWords: TimedWord[],
  originalText: string,
): TimedWord[] {
  const tokens = splitWords(originalText);
  if (tokens.length === 0) return alignmentWords;
  if (alignmentWords.length === 0) return estimateTimedWords(originalText, 2);
  const speechEnd = alignmentWords[alignmentWords.length - 1]!.end;
  if (tokens.length === alignmentWords.length) {
    return alignmentWords.map((w, i) => ({
      ...w,
      word: tokens[i]!,
      index: i,
    }));
  }
  return tokens.map((word, i) => {
    const start = (i / tokens.length) * speechEnd;
    const end = i === tokens.length - 1 ? speechEnd : ((i + 1) / tokens.length) * speechEnd;
    return { word, start, end, index: i };
  });
}

/**
 * Hook / product-payoff clips — synced subtitle windows (up to 6 words, 2 lines in UI).
 */
export function clipCaptionWindowAt(
  words: TimedWord[],
  localTime: number,
  maxWords = CLIP_CAPTION_MAX_WORDS,
): CaptionWindow | null {
  if (words.length === 0) return null;

  const lines = buildClipLineChunks(words, maxWords);
  for (const line of lines) {
    const phraseStart = line[0]!.start;
    const phraseEnd = line[line.length - 1]!.end;
    if (localTime + 0.015 < phraseStart || localTime > phraseEnd + 0.04) continue;

    const active = activeWordAt(line, localTime) ?? line[0]!;
    const activeLocal = line.findIndex((w) => w.index === active.index);
    return {
      words: line,
      activeIndex: active.index,
      activeLocal: activeLocal < 0 ? 0 : activeLocal,
      phraseStart,
      phraseEnd,
    };
  }
  return null;
}

/**
 * Dynamic caption size for 9:16 (1080×1920) so text never overflows.
 * `canvasWidth` is export-space width (1080 or 1920).
 */
export function captionFontSizePx(wordCount: number, canvasWidth: number): number {
  const avail = Math.max(280, canvasWidth - CAPTION_SIDE_PAD * 2);
  const perWordBudget = avail / Math.max(2, wordCount);
  let size = perWordBudget * 0.85;
  if (wordCount <= 2) size = Math.min(72, size);
  else if (wordCount <= 4) size = Math.min(64, size);
  else if (wordCount <= 7) size = Math.min(56, size);
  else size = Math.min(48, size);
  return Math.max(38, Math.round(size));
}

/** Smaller kinetic line for hook / payoff clips — must fit one line inside safe margins. */
export function clipCaptionFontSizePx(wordCount: number, canvasWidth: number): number {
  const avail = Math.max(260, canvasWidth - CAPTION_SIDE_PAD * 2);
  const perWordBudget = avail / Math.max(1, wordCount);
  let size = perWordBudget * 0.72;
  if (wordCount <= 2) size = Math.min(54, size);
  else if (wordCount <= 3) size = Math.min(48, size);
  else size = Math.min(42, size);
  return Math.max(32, Math.round(size));
}

export const REEL_CAPTION_FONT =
  '"Plus Jakarta Sans", Inter, system-ui, -apple-system, sans-serif';
