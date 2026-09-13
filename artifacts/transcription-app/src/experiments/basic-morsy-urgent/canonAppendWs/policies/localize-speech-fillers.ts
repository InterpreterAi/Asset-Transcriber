/**
 * Map Latin fillers (okay / uh / ah / um / m-hm) into the language of the
 * surrounding speech so an Arabic (or Spanish, …) bubble is not painted with
 * English backchannels that also flicker LID.
 *
 * Content words (yes, and, so, hello, hospital) are left alone.
 */

import type { CanonToken } from "../types/canon-token";

type FillerKind = "okay" | "uh" | "um" | "ah" | "oh" | "ugh" | "mhm" | "hmm";

const FILLER_CORE =
  /^(?:ok(?:ay)?|'?kay|uh-?huh|mm-?hm+|m-?hm+|mhm+|hmm+|uh+|um+|uhm+|er+|ah+|ahh+|oh+|ugh)$/iu;

/** Spoken-language form of each filler. Missing lang → leave the Latin token. */
const FILLER_IN_LANG: Record<string, Record<FillerKind, string>> = {
  ar: { okay: "حسنًا", uh: "آه", um: "أم", ah: "آه", oh: "آه", ugh: "أخ", mhm: "مم", hmm: "هم" },
  es: { okay: "vale", uh: "eh", um: "este", ah: "ah", oh: "oh", ugh: "ugh", mhm: "ajá", hmm: "hmm" },
  fr: { okay: "d'accord", uh: "euh", um: "euh", ah: "ah", oh: "oh", ugh: "ugh", mhm: "hum", hmm: "hmm" },
  de: { okay: "okay", uh: "äh", um: "ähm", ah: "ah", oh: "oh", ugh: "ugh", mhm: "mhm", hmm: "hm" },
  pt: { okay: "ok", uh: "é", um: "hum", ah: "ah", oh: "oh", ugh: "ugh", mhm: "ã-hã", hmm: "hmm" },
  it: { okay: "ok", uh: "ehm", um: "ehm", ah: "ah", oh: "oh", ugh: "ugh", mhm: "mhm", hmm: "hmm" },
  ru: { okay: "хорошо", uh: "э", um: "эм", ah: "а", oh: "о", ugh: "уф", mhm: "угу", hmm: "хм" },
  tr: { okay: "tamam", uh: "ıı", um: "ıı", ah: "ah", oh: "oh", ugh: "öh", mhm: "hıhı", hmm: "hmm" },
  pl: { okay: "dobrze", uh: "eee", um: "yyy", ah: "ach", oh: "och", ugh: "ugh", mhm: "mhm", hmm: "hmm" },
  nl: { okay: "oké", uh: "uh", um: "uhm", ah: "ah", oh: "oh", ugh: "ugh", mhm: "mhm", hmm: "hmm" },
  hi: { okay: "ठीक है", uh: "अह", um: "उम", ah: "आह", oh: "ओह", ugh: "उफ", mhm: "हम्म", hmm: "हम्म" },
  ur: { okay: "ٹھیک ہے", uh: "آہ", um: "ام", ah: "آہ", oh: "اوہ", ugh: "اف", mhm: "مم", hmm: "ہم" },
  fa: { okay: "باشه", uh: "اِه", um: "اوم", ah: "آه", oh: "اوه", ugh: "اوف", mhm: "اوم", hmm: "هم" },
  he: { okay: "אוקיי", uh: "אה", um: "אם", ah: "אה", oh: "או", ugh: "איכ", mhm: "ממ", hmm: "הם" },
  zh: { okay: "好", uh: "呃", um: "嗯", ah: "啊", oh: "哦", ugh: "唉", mhm: "嗯", hmm: "嗯" },
  ja: { okay: "はい", uh: "えー", um: "うーん", ah: "あ", oh: "お", ugh: "うっ", mhm: "うん", hmm: "うーん" },
  ko: { okay: "알겠어요", uh: "어", um: "음", ah: "아", oh: "오", ugh: "윽", mhm: "음", hmm: "흠" },
};

function langBase(code: string | undefined): string | undefined {
  const t = code?.trim().toLowerCase();
  if (!t) return undefined;
  return t.split("-")[0];
}

function fillerKind(core: string): FillerKind | null {
  const c = core.toLowerCase().replace(/'/g, "");
  if (c === "ok" || c === "okay" || c === "kay") return "okay";
  if (c === "uhhuh" || c === "uh-huh") return "mhm";
  if (/^mm-?hm+$|^m-?hm+$|^mhm+$/.test(c)) return "mhm";
  if (/^hmm+$/.test(c)) return "hmm";
  if (/^uh+$/.test(c)) return "uh";
  if (/^um+$|^uhm+$|^er+$/.test(c)) return "um";
  if (/^ah+$/.test(c)) return "ah";
  if (/^oh+$/.test(c)) return "oh";
  if (c === "ugh") return "ugh";
  return null;
}

export function splitLatinFiller(text: string): { lead: string; core: string; trail: string } | null {
  const m = text.match(/^(\s*)(.+?)([,.;:!?…،]*)(\s*)$/u);
  if (!m) return null;
  const lead = m[1] ?? "";
  const body = (m[2] ?? "").trim();
  const trail = `${m[3] ?? ""}${m[4] ?? ""}`;
  if (!FILLER_CORE.test(body)) return null;
  return { lead, core: body, trail };
}

function scriptHint(text: string): string | undefined {
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u0590-\u05FF]/.test(text)) return "he";
  if (/[\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return "ar";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  return undefined;
}

export function inferAmbientSpeechLang(
  tokens: readonly CanonToken[],
  rowHint?: { text?: string; language?: string },
): string | undefined {
  const fromRowScript = scriptHint(rowHint?.text ?? "");
  if (fromRowScript) return fromRowScript;
  const counts = new Map<string, number>();
  const bump = (lang: string, n = 1) => counts.set(lang, (counts.get(lang) ?? 0) + n);
  for (const t of tokens) {
    if (splitLatinFiller(t.text ?? "")) continue;
    const byScript = scriptHint(t.text ?? "");
    if (byScript) {
      bump(byScript, (t.text ?? "").length);
      continue;
    }
    const lg = langBase(t.language);
    if (lg && lg !== "en") bump(lg, Math.max(1, (t.text ?? "").trim().length));
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [lang, n] of counts) {
    if (n > bestN) {
      best = lang;
      bestN = n;
    }
  }
  if (best) return best;
  const rowLang = langBase(rowHint?.language);
  if (rowLang && rowLang !== "en") return rowLang;
  return undefined;
}

/**
 * Rewrite Latin fillers to the ambient spoken language. No-op when ambient is
 * English or unknown (real English "Okay, ask him…" stays English).
 */
export function localizeFillersInCanonTokens(
  tokens: readonly CanonToken[],
  rowHint?: { text?: string; language?: string },
): CanonToken[] {
  if (!tokens.length) return tokens as CanonToken[];
  const ambient = inferAmbientSpeechLang(tokens, rowHint);
  if (!ambient || ambient === "en") return tokens as CanonToken[];
  let changed = false;
  const out = tokens.map((t) => {
    const parts = splitLatinFiller(t.text ?? "");
    if (!parts) return t;
    const kind = fillerKind(parts.core);
    if (!kind) return t;
    const mapped = FILLER_IN_LANG[ambient]?.[kind];
    const nextText = mapped ? `${parts.lead}${mapped}${parts.trail}` : t.text;
    if (nextText === t.text && t.language === ambient) return t;
    changed = true;
    return { ...t, text: nextText, language: ambient };
  });
  return changed ? out : (tokens as CanonToken[]);
}
