import type { Token } from "../types/tokens";

const STRONG_ID = /\b(?:INV|inv|PO|po|ORD|ord)[-#]?\s*[A-Z0-9]{4,}\b/i;

export function isEntitySensitiveToken(token: Pick<Token, "text">): boolean {
  const t = token.text.trim();
  if (!t.length) return false;
  if (/^[$€£₪¢]/.test(t)) return true;
  if (/\b\d{1,2}:\d{2}(:\d{2})?\s*(?:[AP]M)?\b/i.test(t)) return true;
  if (/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(t) || /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(t)) return true;
  if (/\d{5,}/.test(t)) return true;
  if (STRONG_ID.test(t)) return true;
  if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t)) return true;
  if (/\d/.test(t) && /[#/@]/.test(t)) return true;
  if (/^(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(t)) return true;
  if (/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/.test(t)) return true;
  return false;
}

export const STAGING_BASE_MS = 180;
export const STAGING_MAX_MS = 400;
