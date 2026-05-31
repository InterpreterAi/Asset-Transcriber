/**
 * Basic · Morsy Urgent Chunk V2 — RTL/LTR mixed-token paint (rendering only).
 * Does not modify translation text stored for MT; applied at DOM paint time.
 */

import { escapeHtml, isRtlTranslationText } from "@/lib/wrap-ltr-numbers";

const LRI = "\u2066";
const PDI = "\u2069";

/** Longest-first LTR islands inside RTL translation paragraphs. */
const MIXED_LTR_TOKEN_RE = new RegExp(
  [
    String.raw`\bMRN[-#]?\s*[\w-]+\b`,
    String.raw`\bCLM[-#]?[\w-]+\b`,
    String.raw`\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b`,
    String.raw`\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b`,
    String.raw`\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b`,
    String.raw`\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b`,
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

/** Unicode isolates for textContent paint fallback. */
export function applyMorsyChunkV2BidiIsolates(text: string): string {
  return wrapMixedDirectionTokens(text, (m) => `${LRI}${m}${PDI}`);
}

/** HTML `<bdi dir="ltr">` for Chunk V2 translation paint. */
export function renderMorsyChunkV2BidiHtml(text: string): string {
  return wrapMixedDirectionTokens(
    text,
    (m) => `<bdi dir="ltr">${escapeHtml(m)}</bdi>`,
  );
}

export function shouldMorsyChunkV2BidiPaint(text: string): boolean {
  return isRtlTranslationText(text);
}
