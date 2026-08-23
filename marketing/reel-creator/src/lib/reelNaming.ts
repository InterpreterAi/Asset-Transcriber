import { reelLanguageLabel } from "@/lib/constants/languages";
import { sanitizeFilenamePart } from "@/lib/timeline";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function reelDateSlug(date = new Date()): string {
  return `${date.getDate()}${MONTHS_SHORT[date.getMonth()]}`;
}

export function reelDateLabel(date = new Date()): string {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function reelStorylineText(raw: string, fallback = "Reel"): string {
  const text = raw.trim().replace(/\s+/g, " ");
  return text || fallback;
}

/** Hook say-lines — primary storyline source for studio reels. */
export function reelStorylineFromSayLines(sayLines: string[], fallback = "Reel"): string {
  const lines = sayLines.map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return fallback;
  const joined = lines.join(" ");
  if (joined.length <= 72) return joined;
  return lines[0]!;
}

export function isEnglishReelLanguage(language: string): boolean {
  const code = language.trim().toLowerCase();
  return code === "en" || code === "english";
}

export function buildReelExportFilename(opts: {
  storyline: string;
  language: string;
  date?: Date;
}): string {
  const slug = sanitizeFilenamePart(reelStorylineText(opts.storyline));
  const date = reelDateSlug(opts.date);
  if (isEnglishReelLanguage(opts.language)) {
    return `${slug}_${date}.mp4`;
  }
  const lang = sanitizeFilenamePart(reelLanguageLabel(opts.language));
  return `${slug}_${date}_${lang}.mp4`;
}

export function buildReelLibraryTitle(opts: {
  storyline: string;
  language: string;
  date?: Date;
}): string {
  const story = reelStorylineText(opts.storyline).slice(0, 80);
  const date = reelDateLabel(opts.date);
  if (isEnglishReelLanguage(opts.language)) {
    return `${story} · ${date}`;
  }
  return `${story} · ${date} · ${reelLanguageLabel(opts.language)}`;
}
