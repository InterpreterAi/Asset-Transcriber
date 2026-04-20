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

export type TranslateBasicProfessionalOpts = {
  /**
   * When true (finalized segment, target English, source not English): run a second Libre pass
   * `source=auto`, `target=en` on the first-pass English so the engine can re-detect language and
   * smooth awkward machine phrasing. Skipped on failure; guarded so we never swap in empty/garbled text.
   */
  refineNonEnglishToEnglishFinal?: boolean;
  signal?: AbortSignal;
};

/**
 * Plain segment: LibreTranslate only.
 * @param sourceLang / targetLang — BCP-47 tags from the client (e.g. zh-CN, en).
 */
export async function translatePlainMachine(
  plain: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<string> {
  const t = plain.trim();
  if (!t) return "";
  return callLibreTranslate(t, sourceLang, targetLang, signal);
}

/** Keep NUM_n placeholders while calling Libre; they are restored server-side after translation. */
function keepNumberPlaceholdersForLibre(text: string): string {
  return text;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeForEchoCompare(s: string): string {
  return collapseWs(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapRatio(a: string, b: string): number {
  const ta = normalizeForEchoCompare(a).split(/\s+/).filter(Boolean);
  const tb = normalizeForEchoCompare(b).split(/\s+/).filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  let hit = 0;
  for (const w of tb) if (setA.has(w)) hit++;
  return hit / Math.max(ta.length, tb.length);
}

/** Detect "translation" that is effectively the same language/source echo. */
function looksLikeSourceEcho(source: string, translated: string): boolean {
  const s = normalizeForEchoCompare(source);
  const t = normalizeForEchoCompare(translated);
  if (!s || !t) return false;
  if (s === t) return true;
  const lenRatio = t.length / Math.max(1, s.length);
  const highOverlap = tokenOverlapRatio(s, t) >= 0.86;
  return highOverlap && lenRatio >= 0.65 && lenRatio <= 1.4;
}

function wordCount(s: string): number {
  return collapseWs(s).split(/\s+/).filter(Boolean).length;
}

function englishReadabilityScore(source: string, candidate: string): number {
  const c = collapseWs(candidate);
  if (!c) return -1_000;
  const chars = [...c];
  const letters = chars.filter((ch) => /\p{L}/u.test(ch)).length;
  const latinLetters = chars.filter((ch) => /[A-Za-z]/.test(ch)).length;
  const nonLatinLetters = Math.max(0, letters - latinLetters);
  const latinRatio = letters > 0 ? latinLetters / letters : 0;
  const nonLatinPenalty = letters > 0 ? nonLatinLetters / letters : 0;
  const srcWords = Math.max(1, wordCount(source));
  const outWords = wordCount(c);
  const coverage = outWords / srcWords;
  const coverageScore = coverage < 0.25 ? -2 : coverage > 2.5 ? -0.5 : 1;
  const punctuationBonus = /[.!?,;:]/.test(c) ? 0.15 : 0;
  return (latinRatio * 2.2) - (nonLatinPenalty * 1.6) + coverageScore + punctuationBonus + Math.min(outWords, 24) / 80;
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
  void slotToDigits;
  const mtInput = keepNumberPlaceholdersForLibre(text);
  const srcBase = (sourceLang.split("-")[0] ?? "").toLowerCase();
  const tgtBase = (targetLang.split("-")[0] ?? "").toLowerCase();
  let out = await translatePlainMachine(mtInput, sourceLang, targetLang, opts?.signal);
  if (
    opts?.refineNonEnglishToEnglishFinal &&
    tgtBase === "en" &&
    srcBase !== "en" &&
    collapseWs(out).length >= 8
  ) {
    const candidates: string[] = [out];
    try {
      const polished = await translatePlainMachine(out.trim(), "auto", "en", opts?.signal);
      if (libreEnglishRefineLooksSafe(out, polished)) {
        candidates.push(polished);
      }
    } catch {
      /* keep primary pass */
    }
    // Rescue path for wrong/uncertain source tags: ask Libre to detect from original text directly.
    try {
      const autoFromSource = await translatePlainMachine(mtInput, "auto", "en", opts?.signal);
      if (libreEnglishRefineLooksSafe(out, autoFromSource)) {
        candidates.push(autoFromSource);
      }
    } catch {
      /* keep best available candidate */
    }
    out = candidates
      .map((c) => ({ c, score: englishReadabilityScore(mtInput, c) }))
      .sort((a, b) => b.score - a.score)[0]?.c ?? out;
  }
  // Enforce opposite-language output: if Libre echoes the source, force auto-detect from original source text.
  if (srcBase !== tgtBase && looksLikeSourceEcho(mtInput, out)) {
    try {
      const forced = await translatePlainMachine(mtInput, "auto", targetLang, opts?.signal);
      if (collapseWs(forced) && !looksLikeSourceEcho(mtInput, forced)) {
        out = forced;
      }
    } catch {
      /* keep best available output */
    }
  }
  return out;
}
