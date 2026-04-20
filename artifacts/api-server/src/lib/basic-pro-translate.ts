import { callLibreTranslate } from "./libretranslate.js";

/**
 * **Final Boss 3 · Libre** — machine translation **only** via **LibreTranslate** for `*-libre` / machine-stack plans.
 * Base URL: `libretranslate.ts` — default Railway internal HTTP URL; override with `LIBRETRANSLATE_INTERNAL_URL` or `LIBRETRANSLATE_URL`.
 * OpenAI (**Final Boss 3 · OpenAI**) lives in `transcription.ts` and is unchanged here.
 *
 * Optional: `LIBRETRANSLATE_API_KEY` in `.env.example` for self-hosted Libre that requires an API key (not sent by current client unless added in `libretranslate.ts`).
 *
 * One Libre HTTP call per segment (`translatePlainMachine` → `callLibreTranslate`).
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
