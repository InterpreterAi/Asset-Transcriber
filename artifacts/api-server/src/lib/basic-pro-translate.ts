import { logger } from "./logger.js";
import { callGoogleTranslate, isGoogleTranslateConfigured } from "./google-translate.js";
import { callLibreTranslate } from "./libretranslate.js";

/**
 * Basic / Professional / trial-libre: same masking pipeline as Platinum, then machine translation.
 * Prefer Google Cloud Translation when configured (latency + stability); fall back to LibreTranslate.
 */
export async function translateBasicProfessional(text: string, source: string, target: string): Promise<string> {
  if (isGoogleTranslateConfigured()) {
    try {
      return await callGoogleTranslate(text, source, target);
    } catch (err) {
      logger.warn({ err }, "Google Translation failed; falling back to LibreTranslate");
    }
  }
  return callLibreTranslate(text, source, target);
}
