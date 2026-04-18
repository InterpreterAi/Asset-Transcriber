import { logger } from "./logger.js";
import { callLibreTranslate } from "./libretranslate.js";
import { callGoogleTranslate, isGoogleTranslateConfigured } from "./google-translate.js";

/**
 * Libre / `*-libre` plans (Final Boss 3): machine translation only. OpenAI stack is separate.
 *
 * **Engine choice** (`MACHINE_TRANSLATION_ENGINE`, optional):
 * - `google` — Cloud Translation API only (`GOOGLE_TRANSLATE_API_KEY` or `GOOGLE_CLOUD_TRANSLATION_API_KEY` required).
 * - `libre` — LibreTranslate only (`LIBRETRANSLATE_URL` or built-in public bases).
 * - Unset — **auto**: Google if a Google key is set, otherwise Libre (never both in one request).
 *
 * `translatePlainMachine` — single engine (used by leak-repair and `/translate` helper).
 * `translateBasicProfessional` — primary + cross-engine fallback for interpreter segments.
 */

export type MachineTranslationEngineKind = "google" | "libre";

function resolveMachineEngine(): MachineTranslationEngineKind {
  const raw = process.env.MACHINE_TRANSLATION_ENGINE?.trim().toLowerCase();
  if (raw === "google") return "google";
  if (raw === "libre") return "libre";
  // auto
  return isGoogleTranslateConfigured() ? "google" : "libre";
}

function machineEngineFallbackOrder(primary: MachineTranslationEngineKind): MachineTranslationEngineKind[] {
  if (primary === "google") {
    return isGoogleTranslateConfigured() ? ["google", "libre"] : ["libre"];
  }
  return isGoogleTranslateConfigured() ? ["libre", "google"] : ["libre"];
}

/**
 * Try primary MT engine then the other (Libre ↔ Google) so `*-libre` tiers stay up if one backend fails.
 */
async function translatePlainMachineWithFallback(
  plain: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const t = plain.trim();
  if (!t) return "";

  const primary = resolveMachineEngine();
  if (primary === "google" && !isGoogleTranslateConfigured()) {
    return callLibreTranslate(t, sourceLang, targetLang);
  }

  const order = machineEngineFallbackOrder(primary);
  let lastErr: unknown;
  for (const eng of order) {
    try {
      if (eng === "google") {
        if (!isGoogleTranslateConfigured()) continue;
        return await callGoogleTranslate(t, sourceLang, targetLang);
      }
      return await callLibreTranslate(t, sourceLang, targetLang);
    } catch (err) {
      lastErr = err;
      logger.warn({ err, engine: eng }, "Machine translation engine failed; trying fallback");
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Machine translation: all engines failed");
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
  return translatePlainMachineWithFallback(text, sourceLang, targetLang);
}
