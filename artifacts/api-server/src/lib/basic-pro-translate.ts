import { callLibreTranslate } from "./libretranslate.js";
import { callGoogleTranslate, isGoogleTranslateConfigured } from "./google-translate.js";
import { callMyMemoryTranslate } from "./mymemory-translate.js";
import { logger } from "./logger.js";

/**
 * Fallback when the API has no OpenAI credentials: Libre-tier accounts (basic, professional,
 * trial-libre, platinum-libre) use this machine stack after the same masking pipeline as Platinum.
 * When OPENAI_API_KEY (or AI integration URL + key) is set, `/translate` uses OpenAI for all tiers instead.
 *
 * Order:
 *   1. Google Cloud Translation API when GOOGLE_TRANSLATE_API_KEY (or GOOGLE_CLOUD_TRANSLATION_API_KEY) is set
 *   2. LibreTranslate (self-hosted or public free instances)
 *   3. MyMemory free API (last resort; strict limits)
 */

function expandNumPlaceholdersToDigits(text: string, slotToDigits: Map<number, string>): string {
  if (slotToDigits.size === 0) return text;
  let out = text;
  const slots = [...slotToDigits.entries()].sort((a, b) => b[0] - a[0]);
  for (const [n, digits] of slots) {
    out = out.replace(new RegExp(`NUM_${n}(?!\\d)`, "g"), () => digits);
  }
  return out;
}

/**
 * Plain segment: Google → Libre → MyMemory. At least one must succeed or throws.
 * @param sourceLang / targetLang — BCP-47 tags from the client (e.g. zh-CN, en) for best engine support.
 */
export async function translatePlainMachine(
  plain: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const t = plain.trim();
  if (!t) return "";

  if (isGoogleTranslateConfigured()) {
    try {
      return await callGoogleTranslate(t, sourceLang, targetLang);
    } catch (err) {
      logger.warn({ err }, "Google Cloud Translate failed; falling back to LibreTranslate");
    }
  }

  try {
    return await callLibreTranslate(t, sourceLang, targetLang);
  } catch (err) {
    logger.warn({ err }, "LibreTranslate failed; falling back to MyMemory");
  }

  return callMyMemoryTranslate(t, sourceLang, targetLang);
}

export async function translateBasicProfessional(
  text: string,
  sourceLang: string,
  targetLang: string,
  slotToDigits: Map<number, string>,
): Promise<string> {
  const hasNums = slotToDigits.size > 0;
  const plain = hasNums ? expandNumPlaceholdersToDigits(text, slotToDigits) : text;
  return translatePlainMachine(plain, sourceLang, targetLang);
}
