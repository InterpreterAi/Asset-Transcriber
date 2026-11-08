/**
 * Trial · Soniox X only.
 *
 * Client-side meaning locks for the TRANSLATION column. Originals are never
 * rewritten. Fixes two Soniox two-way failures:
 * - dialect sexual Arabic rendered as food ("تتناك" → "eat")
 * - informal English rendered as dialect Arabic instead of فصحى
 */

import { lockArabicTranslationToMsa } from "./lock-arabic-translation-msa";

function lettersOnly(s: string): string {
  return (s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function latinCount(s: string): number {
  return (s.match(/[A-Za-z]/g) ?? []).length;
}

function arabicCount(s: string): number {
  return (s.match(/[\u0600-\u06FF]/g) ?? []).length;
}

function endPunct(s: string): string {
  return s.match(/[\s.!?؟،؛]+$/u)?.[0] ?? "";
}

function withEndPunct(body: string, from: string): string {
  const punct = endPunct(from);
  return punct && !endPunct(body) ? `${body}${punct}` : body;
}

const SEXUAL_AR_RE = /تتناك|يتناك|اتناك|تنتاك|تنيك|ينيك|أنيك/;

/**
 * English originals whose Arabic translation must be فصحى (whole-utterance swap).
 * Longer phrases first.
 */
const EN_UTTERANCE_TO_MSA: { source: string; target: string }[] = [
  { source: "What the fuck do you mean, bro", target: "ماذا تقصد بحق الجحيم يا رجل" },
  { source: "What the fuck do you mean bro", target: "ماذا تقصد بحق الجحيم يا رجل" },
  { source: "What the fuck do you mean", target: "ماذا تقصد بحق الجحيم" },
  { source: "What do you mean, bro", target: "ماذا تقصد يا رجل" },
  { source: "What do you mean bro", target: "ماذا تقصد يا رجل" },
];

function englishDominant(text: string): boolean {
  const latin = latinCount(text);
  const arabic = arabicCount(text);
  return latin >= 8 && latin > arabic;
}

function arabicDominant(text: string): boolean {
  const latin = latinCount(text);
  const arabic = arabicCount(text);
  return arabic >= 4 && arabic > latin;
}

function motionCome(original: string): boolean {
  return /\b(?:come|comes|coming|came)\b/i.test(original);
}

function sexualCum(original: string): boolean {
  return /\bcum(?:s|ming|med)?\b/i.test(original);
}

/** Arrival Arabic for "come", never the orgasm sense. Person follows the English subject. */
function arrivalArabic(original: string): string {
  if (/\b(?:i will come|i'll come|i am coming|i'm coming)\b/i.test(original)) return "سأأتي";
  if (/\b(?:we will come|we're coming|we are coming)\b/i.test(original)) return "سنأتي";
  if (/\b(?:she will come|she's coming|she is coming)\b/i.test(original)) return "ستأتي";
  if (/\b(?:he will come|he's coming|he is coming)\b/i.test(original)) return "سيأتي";
  if (/\b(?:they will come|they're coming|they are coming)\b/i.test(original)) return "سيأتون";
  if (/\b(?:you will come|you're coming|you are coming)\b/i.test(original)) return "ستأتي";
  if (/\bi came\b/i.test(original)) return "أتيت";
  if (/\bcome here\b/i.test(original)) return "تعال إلى هنا";
  if (/\bcome in\b/i.test(original)) return "ادخل";
  if (/\bcome back\b/i.test(original)) return "عد";
  if (/\bcoming\b/i.test(original)) return "قادم";
  if (/\bcame\b/i.test(original)) return "أتى";
  return "يأتي";
}

/**
 * "come" is arrival. "cum" is sexual. A bare "come" pin used to force النشوة
 * onto every "I will come".
 */
function lockComeVersusCum(original: string, translation: string): string {
  const sexual = sexualCum(original);
  const motion = motionCome(original);
  if (sexual && motion) return translation;
  if (motion && /النشوة/.test(translation)) {
    const arrival = arrivalArabic(original);
    if (translation.trim().split(/\s+/).length <= 6) return withEndPunct(arrival, translation);
    return translation
      .replace(/يصل إلى النشوة/g, arrival)
      .replace(/تصل إلى النشوة/g, arrival)
      .replace(/النشوة/g, arrival);
  }
  if (sexual && !/النشوة|المني/.test(translation) && original.trim().split(/\s+/).length <= 3) {
    if (/سأتي|سأأتي|سأحضر|سيأتي|ستأتي|قادم|يأتي|أتيت|أتى/.test(translation)) {
      return withEndPunct("النشوة", translation);
    }
  }
  return translation;
}

function lockEnglishToMsa(original: string, translation: string): string {
  if (!englishDominant(original) || !arabicDominant(translation)) return translation;
  const o = lettersOnly(original);
  for (const { source, target } of EN_UTTERANCE_TO_MSA) {
    const s = lettersOnly(source);
    if (!s) continue;
    if (o === s || o.startsWith(`${s} `) || o.endsWith(` ${s}`)) {
      return withEndPunct(target, translation);
    }
  }
  return translation;
}

function lockSexualArabicToEnglish(original: string, translation: string): string {
  if (!SEXUAL_AR_RE.test(original)) return translation;
  if (!/\beat\b/i.test(translation)) return translation;
  return translation
    .replace(/\bwanted to eat\b/gi, "wanted to get fucked")
    .replace(/\bwants to eat\b/gi, "wants to get fucked")
    .replace(/\bgoing to eat\b/gi, "going to get fucked")
    .replace(/\bto eat\b/gi, "to get fucked");
}

/**
 * Fix translation meaning without touching the original column.
 * Safe on live and final rows. Arabic translations are always forced to فصحى
 * regardless of spoken dialect in the Original.
 */
export function applyFaithfulMeaningFixes(original: string, translation: string): string {
  if (!original.trim() || !translation.trim()) return translation;
  let out = lockSexualArabicToEnglish(original, translation);
  out = lockEnglishToMsa(original, out);
  // Any Arabic in the translation column → فصحى (not only "arabicDominant").
  if (/[\u0600-\u06FF]/.test(out)) out = lockArabicTranslationToMsa(out);
  // After فصحى, so arrival wording is not rewritten back into النشوة.
  out = lockComeVersusCum(original, out);
  return out;
}

/** One-way display pins: dialect/vulgar original → standard target. Never the reverse. */
export function meaningLockPinPairs(langA: string, langB: string): { source: string; target: string }[] {
  const a = (langA || "").split("-")[0]?.toLowerCase() ?? "";
  const b = (langB || "").split("-")[0]?.toLowerCase() ?? "";
  if (a !== "ar" && b !== "ar") return [];
  return [
    { source: "تتناك", target: "to get fucked" },
    { source: "يتناك", target: "to get fucked" },
    { source: "عايزة تتناك", target: "wanted to get fucked" },
    { source: "عايز تتناك", target: "wanted to get fucked" },
    { source: "What the fuck do you mean, bro", target: "ماذا تقصد بحق الجحيم يا رجل" },
    { source: "What the fuck do you mean", target: "ماذا تقصد بحق الجحيم" },
  ];
}
