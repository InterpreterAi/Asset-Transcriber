import { callLibreTranslate } from "./libretranslate.js";

/**
 * Basic / Professional / trial-libre: LibreTranslate only — public mirrors when
 * `LIBRETRANSLATE_URL` is unset, or your self-hosted instance when set.
 * Same upstream masking as Platinum (phrases, glossary, protected terms; digits expanded for Libre).
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

export async function translateBasicProfessional(
  text: string,
  source: string,
  target: string,
  slotToDigits: Map<number, string>,
): Promise<string> {
  const hasNums = slotToDigits.size > 0;
  const plain = hasNums ? expandNumPlaceholdersToDigits(text, slotToDigits) : text;
  return callLibreTranslate(plain, source, target);
}
