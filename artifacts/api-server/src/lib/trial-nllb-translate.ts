/**
 * NLLB FastAPI workers (LibreTranslate-compatible `/translate`).
 * - `TRIAL_HETZNER_NLLB_BASE` — trial-hetzner plan (all segments).
 * - `NLLB_PAID_BASE` — paid machine plans, Arabic pairs only (see hetzner-translate.ts).
 */

import { logger } from "./logger.js";

const CHUNK_CHAR_THRESHOLD = Math.max(
  40,
  Number.parseInt(process.env.TRIAL_HETZNER_NLLB_CHUNK_THRESHOLD?.trim() ?? "100", 10) || 100,
);

function parseNllbBaseUrl(envName: string, raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  try {
    new URL(trimmed);
    return trimmed.replace(/\/+$/, "");
  } catch {
    logger.error({ raw, envName }, `${envName} is not a valid URL — ignoring`);
    return null;
  }
}

export function trialHetznerNllbBaseUrl(): string | null {
  return parseNllbBaseUrl("TRIAL_HETZNER_NLLB_BASE", process.env.TRIAL_HETZNER_NLLB_BASE);
}

/** Paid lane NLLB worker — Arabic source or target only when set on API server. */
export function nllbPaidBaseUrl(): string | null {
  return parseNllbBaseUrl("NLLB_PAID_BASE", process.env.NLLB_PAID_BASE);
}

export function trialHetznerUsesNllb(): boolean {
  return trialHetznerNllbBaseUrl() != null;
}

export function nllbPaidArabicRoutingEnabled(): boolean {
  return nllbPaidBaseUrl() != null;
}

export function machineTranslationPairInvolvesArabic(sourceLang: string, targetLang: string): boolean {
  const norm = (c: string) => (c || "").trim().toLowerCase().split("-")[0]!;
  const src = norm(sourceLang);
  const tgt = norm(targetLang);
  return src === "ar" || tgt === "ar";
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
