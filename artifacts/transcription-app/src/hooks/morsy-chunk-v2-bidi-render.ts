/**
 * Basic · Morsy Urgent Chunk V2 — RTL/LTR mixed-token paint (rendering only).
 * Does not modify translation text stored for MT; applied at DOM paint time.
 */

import { escapeHtml, isRtlTranslationText } from "@/lib/wrap-ltr-numbers";

const LRI = "\u2066";
const RLI = "\u2067";
const FSI = "\u2068";
const PDI = "\u2069";

/** Longest-first LTR islands inside RTL translation paragraphs. */
const MIXED_LTR_TOKEN_RE = new RegExp(
  [
    String.raw`\bMRN[-#]?\s*[\w-]+\b`,
    String.raw`\bCLM[-#]?[\w-]+\b`,
    // Full NANP / intl phones as ONE island (1-888-642-7434, +1 888 642 7434).
    String.raw`\+?\d{1,3}[-.\s]\d{3}[-.\s]\d{3}[-.\s]\d{4}\b`,
    String.raw`\b\d{1,3}[-.\s]\d{3}[-.\s]\d{3}[-.\s]\d{4}\b`,
    String.raw`\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b`,
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
    String.raw`\b\d+(?:\.\d+)?\s*(?:mg\/dL|mg\/dl|mmol\/L|mEq\/L|g\/dL)\b`,
    String.raw`\b[A-Za-z]{2,}(?:[/\-.][A-Za-z0-9%]+)*\b`,
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

function wrapMixedDirectionTokens(text: string, wrap: (token: string) => string): string {
  if (!text) return "";
  const grouped = groupMedicalMeasurementTokens(text);
  MIXED_LTR_TOKEN_RE.lastIndex = 0;
  return grouped.replace(MIXED_LTR_TOKEN_RE, (m) => wrap(m));
}

/** Strip Unicode bidi isolates so copy/export never leaks ⁦…⁩ marks. */
export function stripMorsyChunkV2BidiIsolates(text: string): string {
  return text.replace(new RegExp(`[${LRI}${RLI}${FSI}${PDI}]`, "g"), "");
}

/** Unicode isolates for textContent paint fallback (prefer HTML path). */
export function applyMorsyChunkV2BidiIsolates(text: string): string {
  return wrapMixedDirectionTokens(text, (m) => `${LRI}${m}${PDI}`);
}

/**
 * HTML `<bdi dir="ltr">` for Chunk V2 translation paint.
 * Escapes every segment — safe for innerHTML; plain textContent/copy has no isolates.
 */
export function renderMorsyChunkV2BidiHtml(text: string): string {
  if (!text) return "";
  const grouped = groupMedicalMeasurementTokens(text);
  MIXED_LTR_TOKEN_RE.lastIndex = 0;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = MIXED_LTR_TOKEN_RE.exec(grouped)) !== null) {
    out += escapeHtml(grouped.slice(last, m.index));
    out += `<bdi dir="ltr">${escapeHtml(m[0])}</bdi>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(grouped.slice(last));
  return out;
}

/** RTL mixed-token paint (Chunk V2 + Clean MT Arabic/Hebrew output). */
export function shouldMorsyChunkV2BidiPaint(text: string): boolean {
  return isRtlTranslationText(text);
}
