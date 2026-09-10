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

/**
 * Longer dialect forms first. Translation-column only — never run on Original.
 * Covers Egyptian / Levantine / Gulf / Maghrebi leaks seen in live interpreter calls.
 */
const ARABIC_DIALECT_TO_MSA: readonly [string, string][] = [
  // Multi-word / longer first
  ["دلوقتي", "الآن"],
  ["دلوقت", "الآن"],
  ["على أساس", "لكي"],
  ["علشان", "لأن"],
  ["عشان", "لأن"],
  ["ما فيش", "لا يوجد"],
  ["مافيش", "لا يوجد"],
  ["مفيش", "لا يوجد"],
  ["ما في", "لا يوجد"],
  ["مش هيتحفظ", "لن يُحفظ"],
  ["هيتحفظ", "يُحفظ"],
  ["هتُحسب", "ستُحسب"],
  ["هتحسب", "ستُحسب"],
  ["الملف الطبي بتاعك", "ملفك الطبي"],
  ["بتاعك", "الخاص بك"],
  ["بتاعي", "الخاص بي"],
  ["خلّيني", "دعني"],
  ["خليني", "دعني"],
  ["ادّيني", "أعطني"],
  ["اديني", "أعطني"],
  ["تجيبلي", "تحضر لي"],
  ["جيبلي", "أحضر لي"],
  ["هعمل", "سأقوم بـ"],
  ["هرمّي", "سأرفع"],
  ["هرمي", "سأرفع"],
  ["هغسلها", "سأنظفها"],
  ["هشوف", "سأرى"],
  ["هتحسّيه", "ستشعرين به"],
  ["هتحسيه", "ستشعرين به"],
  ["أديك", "أعطيك"],
  ["أديك شيء", "أعطيك شيئا"],
  ["بيتعبني", "يتعبني"],
  ["بيتكلم", "يتحدث"],
  ["بيتعمل", "يُجرى"],
  ["مش فاهم", "لا أفهم"],
  ["مش قادر", "لا أستطيع"],
  ["مش عايزة", "لا أريد"],
  ["مش مشكلة", "لا مانع"],
  ["ما كانش", "لم يكن"],
  ["ما نامت", "لم تنم"],
  ["ما تقدر", "لا تستطيع"],
  ["تقدر تشوف", "هل تستطيع أن ترى"],
  ["تقدر", "تستطيع"],
  ["عايزة", "أريد"],
  ["عايز", "أريد"],
  ["تبغى", "تريد"],
  ["تبي", "تريد"],
  ["كيفاش", "كيف"],
  ["إزاي", "كيف"],
  ["ازاي", "كيف"],
  ["شلون", "كيف"],
  ["علاش", "لماذا"],
  ["ليش", "لماذا"],
  ["ليه", "لماذا"],
  ["شنو", "ماذا"],
  ["إيش", "ماذا"],
  ["ايش", "ماذا"],
  ["إيه", "ماذا"],
  ["ايه", "ماذا"],
  ["فين", "أين"],
  ["وين", "أين"],
  ["كدة", "هكذا"],
  ["كده", "هكذا"],
  ["هيك", "هكذا"],
  ["شوية", "قليلا"],
  ["شوي", "قليلا"],
  ["بزاف", "كثيرا"],
  ["برشا", "كثيرا"],
  ["دابا", "الآن"],
  ["توا", "الآن"],
  ["هلق", "الآن"],
  ["هلأ", "الآن"],
  ["دلوقتي", "الآن"],
  ["ماكو", "لا يوجد"],
  ["أكو", "يوجد"],
  ["ايوا", "نعم"],
  ["أيوه", "نعم"],
  ["ايوه", "نعم"],
  ["واش", "هل"],
  ["صافي", "حسنا"],
  ["باركا", "يكفي"],
  ["يلا", "هيا"],
  ["كويس", "جيد"],
  ["حلو", "حسن"],
  ["زين", "جيد"],
  ["زينة", "جيدة"],
  ["تمام", "حسنا"],
  ["الخشم", "الأنف"],
  ["خشم", "أنف"],
  ["تليفوني", "هاتفي"],
  ["تليفون", "هاتف"],
  ["مكتومة", "مسدودة"],
  ["مره قوي", "شديد جدا"],
  ["مرة قوي", "شديد جدا"],
  ["قوي هنا", "شديد هنا"],
  ["فيه ألم", "هناك ألم"],
  ["في الخشم", "في الأنف"],
  ["مش", "ليس"],
  ["ده", "هذا"],
  ["دي", "هذه"],
  ["أهو", "ها هو"],
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
    out = out.replace(/\s{2,}/g, " ").trim();
  }
  if (target && baseLang(target) === "en") {
    out = applyPairs(out, ENGLISH_COLLOQUIAL_TO_STANDARD, "en", protectedPhrases);
  }
  return out;
}
