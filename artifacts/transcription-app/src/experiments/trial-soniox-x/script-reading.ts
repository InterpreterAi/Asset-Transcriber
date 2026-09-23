/**
 * Trial · Soniox X only.
 *
 * Latin readings under (or instead of) non-Latin Asian script in both transcript
 * columns: Japanese romaji, Chinese pinyin, Korean romaja, Thai romanization.
 */
import { pinyin } from "pinyin-pro";
import { romanize as romanizeHangul } from "es-hangul";
import { romanizeSentence as romanizeThaiSentence } from "@pcampus/thai-romanization";
import {
  containsJapaneseScript,
  ensureJapaneseRomaji,
  japaneseTextToRomaji,
} from "./japanese-romaji";

const HIRAGANA_KATAKANA_RE = /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D]/;
const HANGUL_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const THAI_RE = /[\u0E00-\u0E7F]/;
const HANZI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

export type ScriptReadingFamily = "ja" | "zh" | "ko" | "th";
export type ScriptReadingMode = "off" | "under" | "latin-only";

export const SCRIPT_READING_STORAGE_KEY = "soniox-x-script-reading-mode";
/** Legacy toggle from the Japanese-only Romaji button. */
export const LEGACY_JA_ROMAJI_STORAGE_KEY = "soniox-x-ja-romaji";
export const SONIOX_X_LAYOUT_STORAGE_KEY = "soniox-x-layout-stacked";

const FAMILY_META: Record<
  ScriptReadingFamily,
  { button: string; buttonOnly: string; loading: string; titleUnder: string; titleOnly: string }
> = {
  ja: {
    button: "Romaji",
    buttonOnly: "Romaji only",
    loading: "Romaji…",
    titleUnder: "Show Latin romaji under Japanese in both columns. Click again for romaji only.",
    titleOnly: "Romaji only (hide Japanese script). Click again to turn off.",
  },
  zh: {
    button: "Pinyin",
    buttonOnly: "Pinyin only",
    loading: "Pinyin…",
    titleUnder: "Show pinyin under Chinese in both columns. Click again for pinyin only.",
    titleOnly: "Pinyin only (hide Chinese characters). Click again to turn off.",
  },
  ko: {
    button: "Romaja",
    buttonOnly: "Romaja only",
    loading: "Romaja…",
    titleUnder: "Show Latin romaja under Korean in both columns. Click again for romaja only.",
    titleOnly: "Romaja only (hide Hangul). Click again to turn off.",
  },
  th: {
    button: "Romanize",
    buttonOnly: "Romanize only",
    loading: "Romanize…",
    titleUnder: "Show Latin reading under Thai in both columns. Click again for Latin only.",
    titleOnly: "Latin only (hide Thai script). Click again to turn off.",
  },
};

export function normalizeLangBase(code: string | undefined | null): string {
  return (code ?? "").trim().toLowerCase().split("-")[0] ?? "";
}

export function readingFamilyForLang(code: string | undefined | null): ScriptReadingFamily | null {
  const base = normalizeLangBase(code);
  if (base === "ja") return "ja";
  if (base === "zh") return "zh";
  if (base === "ko") return "ko";
  if (base === "th") return "th";
  return null;
}

/** Prefer Japanese → Chinese → Korean → Thai when a pair has more than one. */
export function readingFamilyForPair(
  langA: string | undefined | null,
  langB: string | undefined | null,
): ScriptReadingFamily | null {
  const a = readingFamilyForLang(langA);
  const b = readingFamilyForLang(langB);
  const order: ScriptReadingFamily[] = ["ja", "zh", "ko", "th"];
  for (const fam of order) {
    if (a === fam || b === fam) return fam;
  }
  return null;
}

export function pairSupportsScriptReading(
  langA: string | undefined | null,
  langB: string | undefined | null,
): boolean {
  return readingFamilyForPair(langA, langB) != null;
}

export function readScriptReadingMode(): ScriptReadingMode {
  if (typeof window === "undefined") return "off";
  try {
    const raw = localStorage.getItem(SCRIPT_READING_STORAGE_KEY);
    if (raw === "under" || raw === "latin-only" || raw === "off") return raw;
    if (localStorage.getItem(LEGACY_JA_ROMAJI_STORAGE_KEY) === "1") return "under";
  } catch {
    /* storage */
  }
  return "off";
}

export function writeScriptReadingMode(mode: ScriptReadingMode): void {
  try {
    localStorage.setItem(SCRIPT_READING_STORAGE_KEY, mode);
    localStorage.setItem(LEGACY_JA_ROMAJI_STORAGE_KEY, mode === "off" ? "0" : "1");
  } catch {
    /* storage */
  }
}

export function cycleScriptReadingMode(mode: ScriptReadingMode): ScriptReadingMode {
  if (mode === "off") return "under";
  if (mode === "under") return "latin-only";
  return "off";
}

export function readLayoutStackedPreferred(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SONIOX_X_LAYOUT_STORAGE_KEY) === "stacked";
  } catch {
    return false;
  }
}

export function writeLayoutStackedPreferred(stacked: boolean): void {
  try {
    if (stacked) localStorage.setItem(SONIOX_X_LAYOUT_STORAGE_KEY, "stacked");
    else localStorage.removeItem(SONIOX_X_LAYOUT_STORAGE_KEY);
  } catch {
    /* storage */
  }
}

export function readingButtonCopy(
  family: ScriptReadingFamily,
  mode: ScriptReadingMode,
  loading: boolean,
): { label: string; title: string; pressed: boolean } {
  const meta = FAMILY_META[family];
  if (mode === "off") {
    return {
      label: meta.button,
      title: meta.titleUnder,
      pressed: false,
    };
  }
  if (mode === "under") {
    return {
      label: loading ? meta.loading : meta.button,
      title: meta.titleUnder,
      pressed: true,
    };
  }
  return {
    label: loading ? meta.loading : meta.buttonOnly,
    title: meta.titleOnly,
    pressed: true,
  };
}

/**
 * Which converter to use for this cell. Japanese kana wins over bare Han so
 * Japanese lines never go through Chinese pinyin.
 */
export function detectReadingFamilyForText(
  text: string,
  pairFamily: ScriptReadingFamily | null,
): ScriptReadingFamily | null {
  const t = text ?? "";
  if (!t.trim()) return null;
  if (HIRAGANA_KATAKANA_RE.test(t)) return "ja";
  if (HANGUL_RE.test(t)) return "ko";
  if (THAI_RE.test(t)) return "th";
  if (HANZI_RE.test(t) || containsJapaneseScript(t)) {
    if (pairFamily === "ja") return "ja";
    if (pairFamily === "zh") return "zh";
    if (HANZI_RE.test(t)) return "zh";
  }
  return null;
}

export function shouldShowScriptReading(
  text: string,
  mode: ScriptReadingMode,
  pairFamily: ScriptReadingFamily | null,
): boolean {
  if (mode === "off") return false;
  return detectReadingFamilyForText(text, pairFamily) != null;
}

function chineseToPinyin(text: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || !HANZI_RE.test(clean)) return "";
  return pinyin(clean, { toneType: "none", type: "string", nonZh: "consecutive" })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function koreanToRomaja(text: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || !HANGUL_RE.test(clean)) return "";
  return romanizeHangul(clean).replace(/[ \t]{2,}/g, " ").trim();
}

function thaiToLatin(text: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || !THAI_RE.test(clean)) return "";
  try {
    return romanizeThaiSentence(clean).replace(/[ \t]{2,}/g, " ").trim();
  } catch {
    return romanizeThaiSentence(clean.replace(/\s+/g, "")) || "";
  }
}

export function textToLatinReading(
  text: string,
  pairFamily: ScriptReadingFamily | null,
): string {
  const family = detectReadingFamilyForText(text, pairFamily);
  if (!family) return "";
  if (family === "ja") return japaneseTextToRomaji(text);
  if (family === "zh") return chineseToPinyin(text);
  if (family === "ko") return koreanToRomaja(text);
  return thaiToLatin(text);
}

/** Japanese needs an async dict; other families are sync. */
export function ensureScriptReadingReady(family: ScriptReadingFamily | null): Promise<void> {
  if (family === "ja") return ensureJapaneseRomaji();
  return Promise.resolve();
}
