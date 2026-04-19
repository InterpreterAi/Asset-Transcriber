import { callLibreTranslate } from "./libretranslate.js";

/**
 * Libre / `*-libre` plans (Final Boss 3): machine translation **only** via **LibreTranslate**
 * (free public HTTPS instances when `LIBRETRANSLATE_URL` is unset, or your self-hosted URL).
 * OpenAI interpreter stack is unchanged for non–`*-libre` plans.
 *
 * Optional: `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` (see `libretranslate.ts`).
 *
 * **Into-English finals:** up to **two** Libre HTTP calls per finalized segment — primary
 * `sourceLang → en`, then optional `auto → en` on the English draft to reduce calques / mixed
 * script leakage (live streaming segments stay a single call).
 */

export type TranslateBasicProfessionalOpts = {
  /**
   * When true (finalized segment, target English, source not English): run a second Libre pass
   * `source=auto`, `target=en` on the first-pass English so the engine can re-detect language and
   * smooth awkward machine phrasing. Skipped on failure; guarded so we never swap in empty/garbled text.
   */
  refineNonEnglishToEnglishFinal?: boolean;
};

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

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Accept a second-pass Libre `auto → en` polish only if it still looks like a full translation
 * (Libre occasionally returns junk or near-empty on auto).
 */
function libreEnglishRefineLooksSafe(first: string, second: string): boolean {
  const a = collapseWs(first);
  const b = collapseWs(second);
  if (!b) return false;
  if (b.length < Math.min(8, Math.floor(a.length * 0.28))) return false;
  if (b.length > Math.max(a.length * 2.25, a.length + 400)) return false;
  return true;
}

export async function translateBasicProfessional(
  text: string,
  sourceLang: string,
  targetLang: string,
  slotToDigits: Map<number, string>,
  opts?: TranslateBasicProfessionalOpts,
): Promise<string> {
  const mtInput = expandNumPlaceholdersToDigits(text, slotToDigits);
  const srcBase = (sourceLang.split("-")[0] ?? "").toLowerCase();
  const tgtBase = (targetLang.split("-")[0] ?? "").toLowerCase();
  let out = await translatePlainMachine(mtInput, sourceLang, targetLang);
  if (
    opts?.refineNonEnglishToEnglishFinal &&
    tgtBase === "en" &&
    srcBase !== "en" &&
    collapseWs(out).length >= 8
  ) {
    try {
      const polished = await translatePlainMachine(out.trim(), "auto", "en");
      if (libreEnglishRefineLooksSafe(out, polished)) {
        out = polished;
      }
    } catch {
      /* keep primary pass */
    }
  }
  return out;
}
