/**
 * Trial · Soniox X only.
 *
 * Client-side meaning locks for the TRANSLATION column. Originals are never
 * rewritten. Fixes two Soniox two-way failures:
 * - dialect sexual Arabic rendered as food ("تتناك" → "eat")
 * - informal English rendered as dialect Arabic instead of فصحى
 *
 * Sexual / vulgar pins: see `sexual-vulgar-glossary.ts` (EN↔فصحى bidirectional;
 * dialect Arabic → accurate English only).
 */

import { lockArabicTranslationToMsa } from "./lock-arabic-translation-msa";
import {
  EN_TO_MSA,
  SEXUAL_AR_RE,
  applySexualVulgarTranslationLocks,
  sexualVulgarPinPairs,
} from "./sexual-vulgar-glossary";

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

/**
 * English originals whose Arabic translation must be فصحى (whole-utterance swap).
 * Longer phrases first. Includes curated sexual/vulgar lines from EN_TO_MSA.
 */
const EN_UTTERANCE_TO_MSA: { source: string; target: string }[] = [
  { source: "What the fuck do you mean, bro", target: "ماذا تقصد بحق الجحيم يا رجل" },
  { source: "What the fuck do you mean bro", target: "ماذا تقصد بحق الجحيم يا رجل" },
  { source: "What the fuck do you mean", target: "ماذا تقصد بحق الجحيم" },
  { source: "What do you mean, bro", target: "ماذا تقصد يا رجل" },
  { source: "What do you mean bro", target: "ماذا تقصد يا رجل" },
  // Multi-word sexual/vulgar EN → فصحى (longer first so phrase pins win).
  ...[...EN_TO_MSA]
    .filter((r) => r.en.includes(" "))
    .sort((a, b) => b.en.length - a.en.length)
    .map((r) => ({ source: r.en, target: r.ar })),
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
    .replace(/\bto eat\b/gi, "to get fucked")
    .replace(/\beat\b/gi, "get fucked");
}

/**
 * Fix translation meaning without touching the original column.
 * Safe on live and final rows.
 */
export function applyFaithfulMeaningFixes(original: string, translation: string): string {
  if (!original.trim() || !translation.trim()) return translation;
  let out = lockSexualArabicToEnglish(original, translation);
  out = applySexualVulgarTranslationLocks(original, out);
  out = lockEnglishToMsa(original, out);
  if (arabicDominant(out)) out = lockArabicTranslationToMsa(out);
  return out;
}

/**
 * Display pins for sexual/vulgar + legacy AR locks.
 * AR pairs: EN↔فصحى both ways; dialect AR → English only (never EN → dialect).
 * Other priority langs: EN↔target both ways from the curated list.
 */
export function meaningLockPinPairs(langA: string, langB: string): { source: string; target: string }[] {
  return sexualVulgarPinPairs(langA, langB);
}
