const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/** Arabic script (incl. Persian, Urdu, presentation forms). */
const AR_SCRIPT =
  /[\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\ufb50-\ufdff\ufe70-\ufeff]/;
const HE_SCRIPT = /[\u0590-\u05FF]/;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ESC[ch] ?? ch);
}

/**
 * Wraps ASCII digit runs in `<span dir="ltr">` so they stay left-to-right inside RTL paragraphs (e.g. Arabic).
 * The rest of the string is HTML-escaped. Safe for `innerHTML` when only this output is injected.
 */
export function wrapAsciiDigitRunsWithLtrSpans(text: string): string {
  if (!text) return "";
  const re = /\b\d+\b/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    out += `<span dir="ltr">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

export function getTranslationTypographyMeta(s: string): {
  rtl: boolean;
  arabicScript: boolean;
  hebrewOnly: boolean;
} {
  const arabicScript = AR_SCRIPT.test(s);
  const hebrewScript = HE_SCRIPT.test(s);
  const rtl = arabicScript || hebrewScript;
  return {
    rtl,
    arabicScript,
    hebrewOnly: hebrewScript && !arabicScript,
  };
}

export function isRtlTranslationText(s: string): boolean {
  return getTranslationTypographyMeta(s).rtl;
}
