import { translatePlainMachine } from "./basic-pro-translate.js";
import {
  applyArabicStaticLeakReplacements,
  escapeRegExpForLeaks,
  getEnglishDomainLeakPhrasesSorted,
} from "./en-to-arabic-script-clinical-leaks.js";
import { logger } from "./logger.js";

/**
 * After OpenAI or MT, embedded English domain terms sometimes remain in the target column.
 * - English → Arabic: fast static MSA map.
 * - English → any other target: translate each leaked phrase with the same machine stack (Google → Libre → MyMemory) so Basic/Pro/Platinum all behave consistently.
 */
export async function repairEnglishDomainLeaksInTranslation(
  translated: string,
  srcCode: string,
  tgtCode: string,
  tgtLangBcp47: string,
): Promise<string> {
  if (srcCode !== "en" || tgtCode === "en" || !translated?.trim()) {
    return translated;
  }

  if (tgtCode === "ar") {
    return applyArabicStaticLeakReplacements(translated);
  }

  if (!/[A-Za-z]{2,}/.test(translated)) {
    return translated;
  }

  const phrases = getEnglishDomainLeakPhrasesSorted();
  const hits: string[] = [];
  for (const en of phrases) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExpForLeaks(en)}(?![A-Za-z])`, "i");
    if (re.test(translated)) hits.push(en);
  }
  if (hits.length === 0) return translated;

  const memo = new Map<string, string>();
  await Promise.all(
    hits.map(async (en) => {
      const k = en.toLowerCase();
      if (memo.has(k)) return;
      try {
        const out = (await translatePlainMachine(en, "en", tgtLangBcp47)).trim();
        memo.set(k, out && out.toLowerCase() !== en.toLowerCase() ? out : en);
      } catch (err) {
        logger.warn({ err, en, tgtLangBcp47 }, "English domain leak MT repair failed for phrase");
        memo.set(k, en);
      }
    }),
  );

  let t = translated;
  for (const en of phrases) {
    const repl = memo.get(en.toLowerCase());
    if (!repl || repl === en) continue;
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExpForLeaks(en)}(?![A-Za-z])`, "gi");
    t = t.replace(re, repl);
  }
  return t.replace(/\s{2,}/g, " ").trim();
}
