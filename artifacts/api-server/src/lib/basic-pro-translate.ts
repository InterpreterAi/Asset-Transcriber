import { callLibreTranslate } from "./libretranslate.js";
import { callGoogleTranslate, isGoogleTranslateConfigured } from "./google-translate.js";

/**
 * Libre / `*-libre` plans (Final Boss 3): machine translation only — **one** backend per request
 * (Google **or** Libre, never chained) for latency parity with the OpenAI path. OpenAI stack is unchanged.
 *
 * **Engine choice** (`MACHINE_TRANSLATION_ENGINE`, optional):
 * - `google` — Cloud Translation API only (`GOOGLE_TRANSLATE_API_KEY` or `GOOGLE_CLOUD_TRANSLATION_API_KEY` required).
 * - `libre` — LibreTranslate only (`LIBRETRANSLATE_URL` or built-in public bases).
 * - Unset — **LibreTranslate** (free default). Set `=google` only when you want paid Cloud Translation.
 *
 * `translatePlainMachine` — single-engine MT (leak-repair, `/translate` helper, interpreter segments).
 */

export type MachineTranslationEngineKind = "google" | "libre";

function resolveMachineEngine(): MachineTranslationEngineKind {
  const raw = process.env.MACHINE_TRANSLATION_ENGINE?.trim().toLowerCase();
  if (raw === "google") return "google";
  if (raw === "libre") return "libre";
  // Unset: always Libre — free MT for *-libre; opt into Google with MACHINE_TRANSLATION_ENGINE=google.
  return "libre";
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

/** Expand only NUM_n → exact transcript digits. TERM_/PROT_ stay masked for MT. */
function expandNumPlaceholdersToDigits(text: string, slotToDigits: Map<number, string>): string {
  if (slotToDigits.size === 0) return text;
  let out = text;
  const slots = [...slotToDigits.entries()].sort((a, b) => b[0] - a[0]);
  for (const [n, digits] of slots) {
    out = out.replace(new RegExp(`NUM_${n}(?!\\d)`, "g"), () => digits);
  }
  return out;
}

export async function translateBasicProfessional(
  text: string,
  sourceLang: string,
  targetLang: string,
  slotToDigits: Map<number, string>,
): Promise<string> {
  // Libre/Google usually destroy or omit NUM_* tokens, so restoreNumberPlaceholders never runs
  // and digits disappear from the translation. Send literal digits (same as transcript slots);
  // TERM_/PROT_ remain placeholders. Caller restore still reapplies glossary/protected terms.
  const mtInput = expandNumPlaceholdersToDigits(text, slotToDigits);
  return translatePlainMachine(mtInput, sourceLang, targetLang);
}
