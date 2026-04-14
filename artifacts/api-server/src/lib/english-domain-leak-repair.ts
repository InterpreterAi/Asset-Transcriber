import { translatePlainMachine } from "./basic-pro-translate.js";
import {
  applyArabicStaticLeakReplacements,
  escapeRegExpForLeaks,
  getEnglishDomainLeakPhrasesSorted,
} from "./en-to-arabic-script-clinical-leaks.js";
import {
  fetchTranslationsForLatinTokens,
  latinTokensLeftInTranslatedText,
  rememberGlobalTermPair,
} from "./global-interpreter-term-memory.js";
import { logger } from "./logger.js";

function hasArabicScript(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

const RESIDUAL_LATIN_MIN_LEN = 4;
const MAX_RESIDUAL_TOKENS_MT = 20;

/**
 * Phrase-list repair (non-Arabic targets): known English clinical phrases → MT.
 */
async function repairPhraseListEnglishLeaks(translated: string, tgtLangBcp47: string): Promise<string> {
  if (!/[A-Za-z]{2,}/.test(translated)) return translated;

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

/**
 * Any remaining Latin tokens (e.g. "dialysis" after OpenAI): memory lookup → MT → learn.
 * Runs for all non-English targets when source is English.
 */
async function repairResidualLatinWordLeaks(
  translated: string,
  srcCode: string,
  tgtCode: string,
  tgtLangBcp47: string,
): Promise<string> {
  if (srcCode !== "en" || tgtCode === "en" || !translated?.trim()) return translated;
  if (!/[A-Za-z]{3,}/.test(translated)) return translated;

  let tokens = latinTokensLeftInTranslatedText(translated, RESIDUAL_LATIN_MIN_LEN);
  if (tokens.length === 0) return translated;
  tokens = tokens.slice(0, MAX_RESIDUAL_TOKENS_MT);

  const memory = await fetchTranslationsForLatinTokens(tokens, "en", tgtCode);
  const resolved = new Map<string, string>();

  for (const tok of tokens) {
    const k = tok.toLowerCase();
    if (memory.has(k)) {
      resolved.set(k, memory.get(k)!);
      continue;
    }
    try {
      const out = (await translatePlainMachine(tok, "en", tgtLangBcp47)).trim();
      if (!out || out.toLowerCase() === k) continue;
      if (tgtCode === "ar" && !hasArabicScript(out) && /^[a-z][a-z\s'-]*$/i.test(out)) {
        continue;
      }
      resolved.set(k, out);
      rememberGlobalTermPair("en", tgtCode, k, out);
    } catch (err) {
      logger.warn({ err, tok, tgtLangBcp47 }, "residual Latin token MT failed");
    }
  }

  let t = translated;
  for (const tok of tokens) {
    const k = tok.toLowerCase();
    const repl = resolved.get(k);
    if (!repl) continue;
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExpForLeaks(tok)}(?![A-Za-z])`, "gi");
    t = t.replace(re, repl);
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

/**
 * After OpenAI or MT, embedded English domain terms sometimes remain in the target column.
 * - Static map for Arabic + phrase list for other targets + residual Latin token pass (MT + global DB memory).
 */
export async function repairEnglishDomainLeaksInTranslation(
  translated: string,
  srcCode: string,
  tgtCode: string,
  tgtLangBcp47: string,
  opts?: { interim?: boolean },
): Promise<string> {
  if (srcCode !== "en" || tgtCode === "en" || !translated?.trim()) {
    return translated;
  }

  // Live interim OpenAI: only cheap Arabic static map — skip parallel MT / DB memory (major latency per chunk).
  if (opts?.interim) {
    if (tgtCode === "ar") return applyArabicStaticLeakReplacements(translated);
    return translated;
  }

  let t = translated;
  if (tgtCode === "ar") {
    t = applyArabicStaticLeakReplacements(t);
  } else {
    t = await repairPhraseListEnglishLeaks(t, tgtLangBcp47);
  }

  t = await repairResidualLatinWordLeaks(t, srcCode, tgtCode, tgtLangBcp47);
  return t;
}
