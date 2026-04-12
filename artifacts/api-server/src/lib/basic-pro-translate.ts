import { logger } from "./logger.js";
import { callGoogleTranslate, isGoogleTranslateConfigured } from "./google-translate.js";
import { callLibreTranslate } from "./libretranslate.js";
import { callMyMemoryTranslate } from "./mymemory-translate.js";

/**
 * Basic / Professional / trial-libre: same masking pipeline as Platinum, then machine translation.
 * Free stack (no paid keys): LibreTranslate public mirrors → MyMemory (last resort; strict size/quota limits).
 * Optional GOOGLE_TRANSLATE_API_KEY: Google first, then the free stack.
 */
export async function translateBasicProfessional(text: string, source: string, target: string): Promise<string> {
  if (isGoogleTranslateConfigured()) {
    try {
      const g = await callGoogleTranslate(text, source, target);
      if (g.trim()) return g;
    } catch (err) {
      logger.warn({ err }, "Google Translation failed; falling back to free MT stack");
    }
  }
  try {
    return await callLibreTranslate(text, source, target);
  } catch (err) {
    logger.warn({ err }, "LibreTranslate hosts failed; trying MyMemory free API");
    return callMyMemoryTranslate(text, source, target);
  }
}
