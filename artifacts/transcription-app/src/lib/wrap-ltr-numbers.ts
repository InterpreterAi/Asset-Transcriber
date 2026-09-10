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

export const LRI = "\u2066";
export const PDI = "\u2069";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ESC[ch] ?? ch);
}

/**
 * Longest-first LTR islands for RTL paragraphs.
 * Phones / spaced digit groups must be ONE island or bidi reverses the groups.
 */
const MIXED_LTR_TOKEN_RE = new RegExp(
  [
    String.raw`\bMRN[-#]?\s*[\w-]+\b`,
    String.raw`\bCLM[-#]?[\w-]+\b`,
    // Full NANP / intl phones as ONE island.
    String.raw`\+?\d{1,3}[-.\s]\d{3}[-.\s]\d{3}[-.\s]\d{4}\b`,
    String.raw`\b\d{1,3}[-.\s]\d{3}[-.\s]\d{3}[-.\s]\d{4}\b`,
    String.raw`\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b`,
    // Spaced / dashed digit groups (349 676 4432, 12-34-56) — never split per chunk.
    String.raw`\b\d+(?:[-.\s]\d+){1,5}\b`,
    String.raw`\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b`,
    String.raw`\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b`,
    String.raw`\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b`,
    String.raw`\$\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?`,
    String.raw`\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*\$`,
    String.raw`\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b`,
    String.raw`\b\d{1,3}(?:,\d{3})+\b`,
    String.raw`%\s*\d+(?:\.\d+)?\s*%?`,
    String.raw`\$\s*\d+(?:\.\d+)?\s*%`,
    String.raw`\b[A-Za-z]{2,}(?:[/\-.][A-Za-z0-9]+)*\s*[:：]\s*\d+(?:\.\d+)?\s*(?:%|mg\/dL|mg\/dl|mmol\/L|mEq\/L|g\/dL)?\b`,
    String.raw`\b[A-Za-z]{2,}(?:[/\-.][A-Za-z0-9]+)*\s+\d+(?:\.\d+)?\s*(?:%|mg\/dL|mg\/dl|mmol\/L|mEq\/L|g\/dL)\b`,
    String.raw`\b\d+(?:\.\d+)?\s*(?:mg\/dL|mg\/dl|mmol\/L|mEq\/L|g\/dL|mg|mL|kg|mmHg|bpm|%|dL|mcg|m2|USD|\$|lbs|oz|cm|mm|Hz|kHz|MHz)\b`,
    // Latin names / brands / emails / codes (Mohammed, Dr. Coley, …).
    String.raw`\b[A-Za-z][A-Za-z0-9._@+\-/]*(?:\s[A-Za-z][A-Za-z0-9._@+\-/]*)*\b`,
    String.raw`\b\d+(?:\.\d+)?%`,
    String.raw`\b\d+(?:\.\d+)?\b`,
  ].join("|"),
  "gi",
);

/** Visual anchors for common medical measurements (does not reorder Arabic). */
export function groupMedicalMeasurementTokens(text: string): string {
  let s = text;
  s = s.replace(/\b(BNP)\s+(\d[\d,]*)\b/gi, "$1: $2");
  s = s.replace(/\b(HbA1c|HBA1c|HbA1C)\s+(\d+(?:\.\d+)?%?)\b/gi, (_, abbr, val) => `${abbr}: ${val}`);
  s = s.replace(
    /\b(creatinine|Creatinine|CREATININE)\s+(\d+(?:\.\d+)?\s*(?:mg\/dL|mg\/dl))\b/gi,
    (_, name, val) => `${name}: ${val}`,
  );
  s = s.replace(/\b(MRN)\s+([#\w-]+)\b/gi, "$1: $2");
  s = s.replace(/\b(CLM)\s+([#\w-]+)\b/gi, "$1: $2");
  return s;
}

/** Apply a wrap to each mixed LTR island (longest-first). Paint-only. */
export function wrapMixedLtrTokens(text: string, wrap: (token: string) => string): string {
  if (!text) return "";
  const grouped = groupMedicalMeasurementTokens(text);
  MIXED_LTR_TOKEN_RE.lastIndex = 0;
  return grouped.replace(MIXED_LTR_TOKEN_RE, (m) => wrap(m));
}

/**
 * Unicode LRI/PDI isolates for textContent paint (Original + Translation RTL).
 * Keeps phones like "349 676 4432" as one island so groups do not reverse.
 */
export function isolateLtrRunsInRtl(text: string): string {
  return wrapMixedLtrTokens(text, (m) => `${LRI}${m}${PDI}`);
}

/**
 * Wraps mixed LTR islands in `<span dir="ltr">` for RTL HTML paint.
 * Prefer whole phones / names over per-digit-group wraps.
 */
export function wrapAsciiDigitRunsWithLtrSpans(text: string): string {
  if (!text) return "";
  const grouped = groupMedicalMeasurementTokens(text);
  MIXED_LTR_TOKEN_RE.lastIndex = 0;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = MIXED_LTR_TOKEN_RE.exec(grouped)) !== null) {
    out += escapeHtml(grouped.slice(last, m.index));
    out += `<span dir="ltr">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(grouped.slice(last));
  return out;
}

/** HTML `<bdi dir="ltr">` islands for RTL paint. */
export function wrapMixedLtrWithBdiHtml(text: string): string {
  return wrapMixedLtrTokens(text, (m) => `<bdi dir="ltr">${escapeHtml(m)}</bdi>`);
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
