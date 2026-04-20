import { callLibreTranslate } from "./libretranslate.js";

/**
 * **Final Boss 3 · Libre** — machine translation **only** via **LibreTranslate** for `*-libre` / machine-stack plans.
 * (Free public HTTPS instances when `LIBRETRANSLATE_URL` is unset, or your self-hosted URL.)
 * OpenAI (**Final Boss 3 · OpenAI**) lives in `transcription.ts` and is unchanged here.
 *
 * Optional: `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` (see `libretranslate.ts`).
 *
 * **Into-English finals:** up to **two** Libre HTTP calls per finalized segment — primary
 * `sourceLang → en`, then optional `auto → en` on the English draft to reduce calques / mixed
 * script leakage (live streaming segments stay a single call).
 *
 * Shipped for soak testing: treat as frozen pending ~1 week of user feedback unless explicitly asked to change.
 */

export type TranslateBasicProfessionalOpts = Record<string, never>;

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
  _opts?: TranslateBasicProfessionalOpts,
): Promise<string> {
  const mtInput = expandNumPlaceholdersToDigits(text, slotToDigits);
  return translatePlainMachine(mtInput, sourceLang, targetLang);
}
