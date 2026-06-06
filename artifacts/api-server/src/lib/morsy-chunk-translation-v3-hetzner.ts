/**
 * Morsy Chunk V3 — trial-hetzner segment translation clone.
 * One Hetzner/Libre call per extracted sentence chunk (same mask/restore path as trial-hetzner MT).
 */

import { translateBasicProfessional, type TranslateBasicProfessionalOpts } from "./basic-pro-translate.js";
import { applyArabicStaticLeakReplacements } from "./en-to-arabic-script-clinical-leaks.js";
import { applyInterpreterPhrasePretranslate } from "./interpreter-phrase-pretranslate.js";
import { validateChunkV3Input } from "./morsy-chunk-translation-v3.js";
import {
  applyNumberPlaceholders,
  restoreNumberPlaceholders,
} from "./number-placeholders.js";
import {
  initProtectedTerms,
  applyProtectedTermPlaceholders,
  restoreProtectedTermPlaceholders,
} from "./protected-terms.js";
import type { CoreLane } from "./hetzner-core-router.js";
import type { HetznerMtWireDebugMeta } from "./hetzner-translate.js";
import { logger } from "./logger.js";

export type MorsyChunkV3HetznerMtOpts = TranslateBasicProfessionalOpts & {
  resolvedLane: CoreLane;
  wireDebug?: HetznerMtWireDebugMeta;
};

export type MorsyChunkV3HetznerResult = {
  text: string;
};

function normalizeMachineTranslationPlaceholders(s: string): string {
  if (!s) return s;
  return s
    .replace(/\bTERM\s+(\d+)(?!\d)/gi, "TERM_$1")
    .replace(/\bPROT\s+(\d+)(?!\d)/gi, "PROT_$1")
    .replace(/\bTERM\s*[-–—]\s*(\d+)(?!\d)/gi, "TERM_$1")
    .replace(/\bPROT\s*[-–—]\s*(\d+)(?!\d)/gi, "PROT_$1")
    .replace(/\bTERM\s*_\s*(\d+)(?!\d)/gi, "TERM_$1")
    .replace(/\bPROT\s*_\s*(\d+)(?!\d)/gi, "PROT_$1");
}

function stripStrayLatinAuxiliaryTokens(text: string, sourceBase: string, targetBase: string): string {
  if (!text.trim()) return text;
  if (sourceBase !== "en" || targetBase === "en") return text;
  const leak =
    /\b(will|would|could|should|cannot|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't)\b/gi;
  return text.replace(leak, " ").replace(/\s{2,}/g, " ").trim();
}

function polishArabicTranslationOutput(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/^[.؟!،。'"“”\s\u200c\u200f\u200e]+/u, "").trim();
  t = t.replace(/([.؟!?])\1+/g, "$1");
  t = t.replace(/([^؟?\n]+)[؟?]\s*لليوم[؟?]\s*$/u, "$1 اليوم؟");
  return t.replace(/\s+/g, " ").trim();
}

function postProcessTranslatedText(text: string, sourceBase: string, targetBase: string): string {
  return stripStrayLatinAuxiliaryTokens(text, sourceBase, targetBase);
}

function finalizeMtChunkOutput(
  restoredRaw: string,
  srcCode: string,
  tgtCode: string,
): string {
  let t = postProcessTranslatedText(restoredRaw, srcCode, tgtCode);
  if (srcCode === "en" && tgtCode === "ar") {
    t = applyArabicStaticLeakReplacements(t);
    if (/[A-Za-z]{3,}/.test(t)) {
      t = applyArabicStaticLeakReplacements(t);
    }
  }
  if (tgtCode === "ar") t = polishArabicTranslationOutput(t);
  return t;
}

export async function translateMorsyChunkV3HetznerSentence(args: {
  text: string;
  sourceLang: string;
  targetLang: string;
  mtOpts: MorsyChunkV3HetznerMtOpts;
  sessionId?: number;
}): Promise<MorsyChunkV3HetznerResult> {
  const text = validateChunkV3Input(args.text);
  if (!text) return { text: "" };

  const srcCode = args.sourceLang.split("-")[0]!;
  const tgtCode = args.targetLang.split("-")[0]!;
  const tgtLangBcp47 = args.targetLang;

  const phraseNormalized = applyInterpreterPhrasePretranslate(text);
  initProtectedTerms();
  const prot = applyProtectedTermPlaceholders(phraseNormalized);
  const numMask = applyNumberPlaceholders(prot.masked);

  const restoreOutput = (raw: string): string => {
    let t = normalizeMachineTranslationPlaceholders(String(raw ?? ""));
    t = restoreNumberPlaceholders(t, numMask.slotToDigits);
    t = restoreProtectedTermPlaceholders(t, prot.slotToEntryIndex, tgtLangBcp47);
    return t;
  };

  async function callMt(invocationIndex: number): Promise<string> {
    const raw = await translateBasicProfessional(
      numMask.masked,
      args.sourceLang,
      args.targetLang,
      numMask.slotToDigits,
      {
        ...args.mtOpts,
        wireDebug: args.mtOpts.wireDebug
          ? { ...args.mtOpts.wireDebug, mtInvocationIndex: invocationIndex }
          : undefined,
      },
    );
    const restored = restoreOutput(raw);
    let translated = finalizeMtChunkOutput(restored, srcCode, tgtCode);
    if (!translated.trim() && restored.trim()) {
      translated = postProcessTranslatedText(restored, srcCode, tgtCode);
      if (tgtCode === "ar") translated = polishArabicTranslationOutput(translated);
    }
    return translated.trim();
  }

  let translated = await callMt(0);
  if (!translated && phraseNormalized.trim().length >= 2) {
    logger.warn(
      { sessionId: args.sessionId ?? null, textLen: text.length },
      "Morsy chunk V3 Hetzner empty after mask/restore; retrying masked segment",
    );
    translated = await callMt(1);
  }

  return { text: translated };
}
