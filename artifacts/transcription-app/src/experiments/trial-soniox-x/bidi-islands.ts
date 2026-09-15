/**
 * Trial · Soniox X only.
 *
 * Soniox tokens keep spoken order; Unicode bidi can still scramble mixed
 * RTL/LTR phrases and phone numbers. Isolate opposite-direction islands
 * (and all digit/phone runs) so the column language’s reading direction
 * stays the sentence order.
 *
 * Official STT examples stream tokens in sequence and do not reverse them:
 * https://github.com/soniox/soniox_examples/tree/master/speech_to_text
 */

export type BidiDir = "rtl" | "ltr";

export type BidiPiece = {
  text: string;
  /** Isolate this span; omit when it should inherit the paragraph dir. */
  isolate?: BidiDir;
};

const RTL_SCRIPT_RE =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\ufb50-\ufdff\ufe70-\ufeff]+/g;

/** Phones, times, dates, money, emails, Latin words, remaining digit runs. */
const LTR_ISLAND_RE = new RegExp(
  [
    String.raw`\+?\d[\d\s().-]{4,}\d`,
    String.raw`\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\b`,
    String.raw`\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b`,
    String.raw`\$\s*\d[\d,]*(?:\.\d+)?`,
    String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`,
    String.raw`[A-Za-z][A-Za-z0-9'._+-]*`,
    String.raw`\d[\d.,]*`,
  ].join("|"),
  "g",
);

function splitByRegex(text: string, re: RegExp, isolate: BidiDir): BidiPiece[] {
  const pieces: BidiPiece[] = [];
  re.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pieces.push({ text: text.slice(last, m.index) });
    pieces.push({ text: m[0], isolate });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces.length > 0 ? pieces : [{ text }];
}

/** Split a phrase into inheriting text vs isolated opposite-direction / numeric islands. */
export function splitBidiIslands(text: string, baseDir: BidiDir): BidiPiece[] {
  if (!text) return [];
  return baseDir === "rtl" ? splitByRegex(text, LTR_ISLAND_RE, "ltr") : splitByRegex(text, RTL_SCRIPT_RE, "rtl");
}
