/**
 * Soniox realtime `context` hard limit is 10,000 characters
 * (error: "Context is too long (max length 10000).").
 * Oversized context silently kills chunk-v2 STT + native translation.
 *
 * @see https://soniox.com/docs/stt/concepts/context
 */

import type { SonioxContext, SonioxContextTerm } from "./interpreter-context";

/** Absolute Soniox API ceiling. */
export const SONIOX_CONTEXT_MAX_CHARS = 10_000;
/** Leave headroom for JSON punctuation / Unicode edge cases. */
export const SONIOX_CONTEXT_SAFE_CHARS = 9_800;

export function sonioxContextCharLength(ctx: SonioxContext): number {
  return JSON.stringify(ctx).length;
}

export type FitSonioxContextOptions = {
  /** How many leading translation_terms are personal glossary (never drop before pack/builtin). */
  protectedTranslationTermCount?: number;
  maxChars?: number;
};

/**
 * Trim lowest-priority context until serialized size ≤ maxChars.
 * Drop order: trailing translation_terms (ISA/pack), then recognition pins.
 * Never removes `general` or protected leading glossary translation_terms until last resort.
 */
export function fitSonioxContextToBudget(
  ctx: SonioxContext,
  opts: FitSonioxContextOptions = {},
): SonioxContext {
  const maxChars = opts.maxChars ?? SONIOX_CONTEXT_SAFE_CHARS;
  const protectedCount = Math.max(0, opts.protectedTranslationTermCount ?? 0);

  const next: SonioxContext = {
    general: ctx.general.map((g) => ({ ...g })),
    terms: [...(ctx.terms ?? [])],
  };
  if (ctx.translation_terms && ctx.translation_terms.length > 0) {
    next.translation_terms = ctx.translation_terms.map((t) => ({ ...t }));
  }

  if (sonioxContextCharLength(next) <= maxChars) return next;

  // 1) Drop unprotected translation_terms from the end (pack/ISA first when appended last).
  while (
    next.translation_terms &&
    next.translation_terms.length > protectedCount &&
    sonioxContextCharLength(next) > maxChars
  ) {
    next.translation_terms.pop();
  }
  if (next.translation_terms && next.translation_terms.length === 0) {
    delete next.translation_terms;
  }
  if (sonioxContextCharLength(next) <= maxChars) return next;

  // 2) Drop recognition pins from the end.
  while (next.terms.length > 0 && sonioxContextCharLength(next) > maxChars) {
    next.terms.pop();
  }
  if (sonioxContextCharLength(next) <= maxChars) return next;

  // 3) Last resort: drop protected glossary translation_terms from the end.
  while (
    next.translation_terms &&
    next.translation_terms.length > 0 &&
    sonioxContextCharLength(next) > maxChars
  ) {
    next.translation_terms.pop();
  }
  if (next.translation_terms && next.translation_terms.length === 0) {
    delete next.translation_terms;
  }
  if (sonioxContextCharLength(next) <= maxChars) return next;

  // 4) Extreme: shorten verbose general values (keep keys).
  for (let i = next.general.length - 1; i >= 0 && sonioxContextCharLength(next) > maxChars; i--) {
    const item = next.general[i]!;
    if (item.value.length > 80) {
      item.value = `${item.value.slice(0, 77)}...`;
    }
  }
  while (next.general.length > 2 && sonioxContextCharLength(next) > maxChars) {
    next.general.pop();
  }

  return next;
}

/** Merge unique translation terms; returns how many were newly added. */
export function mergeUniqueTranslationTerms(
  into: SonioxContextTerm[],
  seen: Set<string>,
  from: SonioxContextTerm[],
): number {
  let added = 0;
  for (const t of from) {
    const source = `${t.source ?? ""}`.trim();
    const target = `${t.target ?? ""}`.trim();
    if (!source || !target) continue;
    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    into.push({ source, target });
    added += 1;
  }
  return added;
}
