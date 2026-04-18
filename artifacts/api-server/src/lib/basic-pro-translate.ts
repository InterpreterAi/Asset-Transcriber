import { callLibreTranslate } from "./libretranslate.js";
import { callGoogleTranslate, isGoogleTranslateConfigured } from "./google-translate.js";

/**
 * Fallback when the API has no OpenAI credentials: Libre-tier accounts (basic, professional,
 * trial-libre, platinum-libre) use one machine engine only — faster than chaining providers.
 * When OPENAI_API_KEY (or AI integration URL + key) is set, `/translate` uses OpenAI instead.
 *
 * **Engine choice** (`MACHINE_TRANSLATION_ENGINE`, optional):
 * - `google` — Cloud Translation API only (`GOOGLE_TRANSLATE_API_KEY` or `GOOGLE_CLOUD_TRANSLATION_API_KEY` required).
 * - `libre` — LibreTranslate only (`LIBRETRANSLATE_URL` or built-in public bases).
 * - Unset — **auto**: Google if a Google key is set, otherwise Libre (never both in one request).
 */

export type MachineTranslationEngineKind = "google" | "libre";

function resolveMachineEngine(): MachineTranslationEngineKind {
  const raw = process.env.MACHINE_TRANSLATION_ENGINE?.trim().toLowerCase();
  if (raw === "google") return "google";
  if (raw === "libre") return "libre";
  // auto
  return isGoogleTranslateConfigured() ? "google" : "libre";
}

/**
 * Plain segment: exactly one backend per call (Google **or** Libre — never both).
 * @param sourceLang / targetLang — BCP-47 tags from the client (e.g. zh-CN, en) for best engine support.
 */
export async function translatePlainMachine(
  plain: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const t = plain.trim();
  if (!t) return "";

  const engine = resolveMachineEngine();
  if (engine === "google") {
    if (!isGoogleTranslateConfigured()) {
      throw new Error(
        "MACHINE_TRANSLATION_ENGINE=google but no GOOGLE_TRANSLATE_API_KEY (or GOOGLE_CLOUD_TRANSLATION_API_KEY) is set",
      );
    }
    return callGoogleTranslate(t, sourceLang, targetLang);
  }

  return callLibreTranslate(t, sourceLang, targetLang);
}

export async function translateBasicProfessional(
  text: string,
  sourceLang: string,
  targetLang: string,
  _slotToDigits: Map<number, string>,
): Promise<string> {
  // Keep NUM_* placeholders in `text`. Expanding to digits before Google/Libre caused
  // localized numerals, spelling, and reordering vs the transcript; the caller restores
  // exact ASR digit strings via restoreNumberPlaceholders(_slotToDigits).
  return translatePlainMachine(text, sourceLang, targetLang);
}
