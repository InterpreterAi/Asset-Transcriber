/**
 * trial-hetzner — clean Hetzner translation path (isolated from trial-openai).
 *
 * Mirrors `runMorsyBasicCleanTranslation` preprocessing/postprocessing:
 * - Morsy clean number mask/restore (`NUM_*`)
 * - Calendar-word repair
 *
 * Hetzner-only supplement (Libre has no medical interpreter prompt):
 * - Built-in interpreter glossary mask/restore (`TERM_*`)
 *
 * Never calls OpenAI. Never shares code paths with `runMorsyBasicCleanTranslation`.
 */

import { callHetznerTranslate, type HetznerMtRoutingHint } from "./hetzner-translate.js";
import { applyArabicStaticLeakReplacements } from "./en-to-arabic-script-clinical-leaks.js";
import {
  applyGlossaryPlaceholders,
  initInterpreterGlossaries,
  restoreGlossaryPlaceholders,
} from "./interpreter-glossary.js";
import { repairEnglishCalendarWordsInCleanTranslation } from "./english-calendar-i18n.js";
import {
  applyMorsyCleanNumberProtection,
  restoreMorsyCleanNumberProtection,
} from "./morsy-basic-clean-translate.js";
import { logger } from "./logger.js";

export type TrialHetznerCleanMtOpts = HetznerMtRoutingHint & {
  wireDebug?: HetznerMtRoutingHint["wireDebug"];
};

export type TrialHetznerCleanTranslationResult = {
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

function finalizeTrialHetznerCleanOutput(
  restoredRaw: string,
  srcCode: string,
  tgtCode: string,
  tgtLangBcp47: string,
): string {
  let t = stripStrayLatinAuxiliaryTokens(restoredRaw, srcCode, tgtCode);
  t = repairEnglishCalendarWordsInCleanTranslation(t, tgtLangBcp47);
  if (srcCode === "en" && tgtCode === "ar") {
    t = applyArabicStaticLeakReplacements(t);
    if (/[A-Za-z]{3,}/.test(t)) {
      t = applyArabicStaticLeakReplacements(t);
    }
  }
  if (tgtCode === "ar") t = polishArabicTranslationOutput(t);
  return t.trim();
}

function restoreTrialHetznerCleanOutput(
  raw: string,
  numMask: ReturnType<typeof applyMorsyCleanNumberProtection>,
  slotToEntryIndex: Map<number, number>,
  tgtLang: string,
): string {
  let t = normalizeMachineTranslationPlaceholders(String(raw ?? ""));
  t = restoreGlossaryPlaceholders(t, slotToEntryIndex, tgtLang);
  t = restoreMorsyCleanNumberProtection(t, numMask.slotToLiteral);
  return t;
}

/**
 * Single-segment trial-hetzner translation — parity target: trial-openai clean path.
 */
export async function runTrialHetznerCleanTranslation(args: {
  text: string;
  sourceLang: string;
  targetLang: string;
  mtOpts: TrialHetznerCleanMtOpts;
  sessionId?: number;
}): Promise<TrialHetznerCleanTranslationResult> {
  const srcCode = args.sourceLang.split("-")[0]!;
  const tgtCode = args.targetLang.split("-")[0]!;
  const tgtLangBcp47 = args.targetLang;

  const numMask = applyMorsyCleanNumberProtection(args.text);
  initInterpreterGlossaries();
  const glossary = applyGlossaryPlaceholders(numMask.masked);
  const mtInput = glossary.masked;

  async function callOnce(invocationIndex: number): Promise<string> {
    const raw = await callHetznerTranslate(mtInput, args.sourceLang, args.targetLang, {
      ...args.mtOpts,
      wireDebug: args.mtOpts.wireDebug
        ? { ...args.mtOpts.wireDebug, mtInvocationIndex: invocationIndex }
        : undefined,
    });
    const restored = restoreTrialHetznerCleanOutput(raw, numMask, glossary.slotToEntryIndex, tgtLangBcp47);
    return finalizeTrialHetznerCleanOutput(restored, srcCode, tgtCode, tgtLangBcp47);
  }

  let out = await callOnce(0);
  if (!out.trim() && args.text.trim().length >= 2) {
    logger.warn(
      { sessionId: args.sessionId ?? null, textLen: args.text.length },
      "trial-hetzner clean MT empty; retrying once",
    );
    out = await callOnce(1);
  }

  return { text: out };
}
