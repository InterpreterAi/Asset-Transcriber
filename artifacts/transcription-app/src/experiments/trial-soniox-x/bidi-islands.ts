/**
 * Trial · Soniox X only.
 *
 * Soniox tokens keep spoken / translated order. Unicode bidi must not scramble
 * mixed RTL/LTR sentences. Isolate *maximal* opposite-script runs (a whole
 * English clause, a whole Arabic clause, a phone number) — never each Latin
 * word, which copies as ⁦When⁩ ⁦he⁩ and reads out of order.
 *
 * Official STT examples stream tokens in sequence and do not reverse them:
 * https://github.com/soniox/soniox_examples/tree/master/speech_to_text
 * https://soniox.com/docs/stt/rt/real-time-translation
 */

export type BidiDir = "rtl" | "ltr";

export type BidiPiece = {
  text: string;
  /** Isolate this span; omit when it should inherit the paragraph dir. */
  isolate?: BidiDir;
};

const RTL_SCRIPT_RE =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\ufb50-\ufdff\ufe70-\ufeff]/;
const LTR_STRONG_RE = /[A-Za-z\u00C0-\u024F0-9]/;
/** Hiragana, katakana, and kanji are left-to-right. Counting them keeps a Japanese line from flipping RTL when a short Arabic name is inside it. */
const CJK_KANA_LTR_RE =
  /[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9D]/;
const BIDI_CONTROLS_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function stripBidiControls(text: string): string {
  return (text ?? "").replace(BIDI_CONTROLS_RE, "");
}

function strongDir(ch: string): BidiDir | null {
  if (RTL_SCRIPT_RE.test(ch)) return "rtl";
  if (LTR_STRONG_RE.test(ch) || CJK_KANA_LTR_RE.test(ch)) return "ltr";
  return null;
}

type DirRun = { text: string; dir: BidiDir | "neutral" };

function maximalScriptRuns(text: string): DirRun[] {
  const runs: DirRun[] = [];
  for (const ch of text) {
    const kind = strongDir(ch) ?? "neutral";
    const last = runs[runs.length - 1];
    if (!last) {
      runs.push({ text: ch, dir: kind });
      continue;
    }
    if (kind === "neutral") {
      last.text += ch;
      continue;
    }
    if (last.dir === "neutral" || last.dir === kind) {
      last.text += ch;
      last.dir = kind;
      continue;
    }
    runs.push({ text: ch, dir: kind });
  }
  return runs;
}

/** Letter-count paragraph direction. Fallback when the cell has no strong letters. */
export function dominantBidiDir(text: string, fallback: BidiDir = "ltr"): BidiDir {
  const clean = stripBidiControls(text);
  let rtl = 0;
  let ltr = 0;
  for (const ch of clean) {
    const d = strongDir(ch);
    if (d === "rtl") rtl += 1;
    else if (d === "ltr") ltr += 1;
  }
  if (rtl === 0 && ltr === 0) return fallback;
  return rtl > ltr ? "rtl" : "ltr";
}

/** Split a phrase into inheriting text vs isolated opposite-direction runs. */
export function splitBidiIslands(text: string, baseDir: BidiDir): BidiPiece[] {
  const clean = stripBidiControls(text);
  if (!clean) return [];
  return maximalScriptRuns(clean).map((run) => {
    if (run.dir === "neutral" || run.dir === baseDir) return { text: run.text };
    return { text: run.text, isolate: run.dir };
  });
}
