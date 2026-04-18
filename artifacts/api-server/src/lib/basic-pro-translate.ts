import { callLibreTranslate } from "./libretranslate.js";

/**
 * Libre / `*-libre` plans (Final Boss 3): machine translation **only** via **LibreTranslate**
 * (free public HTTPS instances when `LIBRETRANSLATE_URL` is unset, or your self-hosted URL).
 * Exactly one Libre HTTP call per segment — no Google Cloud Translation, no engine switching.
 * OpenAI interpreter stack is unchanged for non–`*-libre` plans.
 *
 * Optional: `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` (see `libretranslate.ts`).
 */

/**
 * Plain segment: LibreTranslate only.
 * @param sourceLang / targetLang — BCP-47 tags from the client (e.g. zh-CN, en).
 */
export async function translatePlainMachine(
  plain: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const t = plain.trim();
  if (!t) return "";
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
  // LibreTranslate often drops NUM_* tokens; send literal digits. TERM_/PROT_ stay masked; caller restores glossary.
  const mtInput = expandNumPlaceholdersToDigits(text, slotToDigits);
  return translatePlainMachine(mtInput, sourceLang, targetLang);
}
