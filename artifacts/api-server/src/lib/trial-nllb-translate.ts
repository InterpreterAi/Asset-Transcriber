/**
 * trial-hetzner only — routes MT to NLLB FastAPI when TRIAL_HETZNER_NLLB_BASE is set.
 * basic-libre / paid lanes are unaffected (still use LibreTranslate via lane URLs).
 */

import { logger } from "./logger.js";

const CHUNK_CHAR_THRESHOLD = Math.max(
  40,
  Number.parseInt(process.env.TRIAL_HETZNER_NLLB_CHUNK_THRESHOLD?.trim() ?? "100", 10) || 100,
);

export function trialHetznerNllbBaseUrl(): string | null {
  const raw = (process.env.TRIAL_HETZNER_NLLB_BASE ?? "").trim();
  if (!raw) return null;
  try {
    new URL(raw);
    return raw.replace(/\/+$/, "");
  } catch {
    logger.error({ raw }, "TRIAL_HETZNER_NLLB_BASE is not a valid URL — ignoring");
    return null;
  }
}

export function trialHetznerUsesNllb(): boolean {
  return trialHetznerNllbBaseUrl() != null;
}

/** Split on sentence boundaries for long trial-hetzner segments (NLLB accuracy + avoids truncation). */
export function splitTrialHetznerMtChunks(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= CHUNK_CHAR_THRESHOLD) return [t];

  const sentences = t
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length <= 1) {
    // No sentence boundary — split on commas/clauses as a last resort.
    const clauses = t
      .split(/(?<=[,;])\s+/u)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return clauses.length > 1 ? clauses : [t];
  }
  return sentences;
}
