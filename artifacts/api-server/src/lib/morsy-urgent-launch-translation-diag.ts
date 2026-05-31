/**
 * Temporary pre-launch diagnostics for Morsy Urgent live translation quality.
 * Logs embedded-English prompt injection and English leakage in Arabic output.
 */

import {
  escapeRegExpForLeaks,
  getEnglishDomainLeakPhrasesSorted,
} from "./en-to-arabic-script-clinical-leaks.js";

export type MorsyUrgentTranslationLeakDiag = {
  latinTokenCount: number;
  latinTokens: string[];
  phraseLeakHitCount: number;
  phraseLeakHits: string[];
};

/** Latin letter runs left in non-English target output (likely untranslated medical English). */
export function diagnoseEnglishLeakageInTranslation(
  translated: string,
  srcCode: string,
  tgtCode: string,
): MorsyUrgentTranslationLeakDiag {
  if (!translated.trim() || srcCode !== "en" || tgtCode === "en") {
    return { latinTokenCount: 0, latinTokens: [], phraseLeakHitCount: 0, phraseLeakHits: [] };
  }

  const latinTokens = [...translated.matchAll(/(?<![A-Za-z])[A-Za-z]{3,}(?![A-Za-z])/g)]
    .map((m) => m[0]!)
    .filter((tok) => !/^(NUM|TERM|PROT)_\d+$/i.test(tok));

  const phraseHits: string[] = [];
  for (const en of getEnglishDomainLeakPhrasesSorted()) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExpForLeaks(en)}(?![A-Za-z])`, "i");
    if (re.test(translated)) phraseHits.push(en);
  }

  return {
    latinTokenCount: latinTokens.length,
    latinTokens: latinTokens.slice(0, 40),
    phraseLeakHitCount: phraseHits.length,
    phraseLeakHits: phraseHits.slice(0, 40),
  };
}
