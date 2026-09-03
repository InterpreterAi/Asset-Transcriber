/**
 * Translation column only: lock output to the official standard of the target.
 * Originals stay as spoken (including Arabic dialects). Do not use this on STT text.
 */

const ARABIC_DIALECT_TO_MSA: readonly [string, string][] = [
  ["دلوقتي", "الآن"],
  ["دلوقت", "الآن"],
  ["علشان", "لأن"],
  ["عشان", "لأن"],
  ["كيفاش", "كيف"],
  ["إزاي", "كيف"],
  ["ازاي", "كيف"],
  ["علاش", "لماذا"],
  ["ليش", "لماذا"],
  ["ليه", "لماذا"],
  ["فين", "أين"],
  ["وين", "أين"],
  ["كدة", "هكذا"],
  ["كده", "هكذا"],
  ["هيك", "هكذا"],
  ["بزاف", "كثيرا"],
  ["برشا", "كثيرا"],
  ["دابا", "الآن"],
  ["توا", "الآن"],
  ["هلق", "الآن"],
  ["هلأ", "الآن"],
  ["مفيش", "لا يوجد"],
  ["أيوه", "نعم"],
  ["ايوه", "نعم"],
  ["واش", "هل"],
  ["صافي", "حسنا"],
  ["باركا", "يكفي"],
  ["يلا", "هيا"],
];

const ENGLISH_COLLOQUIAL_TO_STANDARD: readonly [string, string][] = [
  ["gonna", "going to"],
  ["wanna", "want to"],
  ["gotta", "have to"],
  ["ain't", "is not"],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceStandalone(
  text: string,
  from: string,
  to: string,
  script: "ar" | "en",
): string {
  const body = escapeRegex(from);
  const re =
    script === "ar"
      ? new RegExp(`(?<![\\u0600-\\u06FF])${body}(?![\\u0600-\\u06FF])`, "g")
      : new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, "gi");
  return text.replace(re, to);
}

function applyPairs(
  text: string,
  pairs: readonly [string, string][],
  script: "ar" | "en",
): string {
  let out = text;
  for (const [from, to] of pairs) {
    out = replaceStandalone(out, from, to, script);
  }
  return out;
}

/** Rewrite leaked dialect in the translation column into the official target register. */
export function lockTranslationToOfficialRegister(
  text: string,
  targetBase: string,
): string {
  if (!text.trim()) return text;
  const base = targetBase.split("-")[0]!.toLowerCase();
  if (base === "ar") return applyPairs(text, ARABIC_DIALECT_TO_MSA, "ar");
  if (base === "en") return applyPairs(text, ENGLISH_COLLOQUIAL_TO_STANDARD, "en");
  return text;
}
