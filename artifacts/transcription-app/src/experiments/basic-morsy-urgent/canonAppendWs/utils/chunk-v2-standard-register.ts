/**
 * Soniox-native translation register only (Trial / Basic / Professional chunk-v2).
 * Originals stay as spoken. Translation column is forced to the professional
 * standard variety (Arabic الفصحى, etc.). Does not touch Libre / OpenAI stacks.
 */

import {
  normalizeWorkspaceLanguageCode,
  workspaceLanguagesEqual,
} from "@/lib/workspace-languages";

import { resolveRowTranslationDirection } from "./chunk-v2-glossary";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

function baseLang(code: string): string {
  return normalizeWorkspaceLanguageCode(code).split("-")[0]!.toLowerCase();
}

/** Longer dialect forms first so "علشان" wins over "عشان". */
const ARABIC_DIALECT_TO_MSA: readonly [string, string][] = [
  ["دلوقتي", "الآن"],
  ["دلوقت", "الآن"],
  ["علشان", "لأن"],
  ["عشان", "لأن"],
  ["كيفاش", "كيف"],
  ["إزاي", "كيف"],
  ["ازاي", "كيف"],
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
  ["يلا", "هيا"],
];

const ENGLISH_COLLOQUIAL_TO_STANDARD: readonly [string, string][] = [
  ["gonna", "going to"],
  ["wanna", "want to"],
  ["gotta", "have to"],
  ["ain't", "is not"],
];

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
  protectedPhrases: readonly string[],
): string {
  const skip = new Set(protectedPhrases.map((p) => p.trim()).filter(Boolean));
  let out = text;
  for (const [from, to] of pairs) {
    if (skip.has(from)) continue;
    out = replaceStandalone(out, from, to, script);
  }
  return out;
}

export type StandardRegisterOpts = {
  rowSourceLanguage: string;
  langA: string;
  langB: string;
  protectedPhrases?: readonly string[];
};

function translationTargetLanguage(
  text: string,
  opts: StandardRegisterOpts,
): string | null {
  const direction = resolveRowTranslationDirection(
    opts.rowSourceLanguage,
    opts.langA,
    opts.langB,
  );
  if (direction) return direction.targetLanguage;
  if (
    looksArabic(text) &&
    (workspaceLanguagesEqual(opts.langA, "ar") ||
      workspaceLanguagesEqual(opts.langB, "ar"))
  ) {
    return "ar";
  }
  return null;
}

/**
 * Rewrite leaked dialect / slang in the Soniox translation column into the
 * professional standard variety. Leaves glossary preferred wording untouched.
 */
export function normalizeChunkV2StandardRegister(
  text: string,
  opts: StandardRegisterOpts,
): string {
  if (!text.trim()) return text;
  const target = translationTargetLanguage(text, opts);
  const protectedPhrases = opts.protectedPhrases ?? [];
  let out = text;

  if ((target && baseLang(target) === "ar") || (!target && looksArabic(text))) {
    out = applyPairs(out, ARABIC_DIALECT_TO_MSA, "ar", protectedPhrases);
  }
  if (target && baseLang(target) === "en") {
    out = applyPairs(out, ENGLISH_COLLOQUIAL_TO_STANDARD, "en", protectedPhrases);
  }
  return out;
}
