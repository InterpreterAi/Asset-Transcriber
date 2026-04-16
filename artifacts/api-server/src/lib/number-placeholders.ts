/**
 * Wraps digit-heavy spans (phones, IDs, dates) so the model cannot spell them out,
 * merge groups, or summarize. Restore preserves the exact substring from the transcript.
 *
 * Matches whole chains: digits with common separators (hyphen, slash, dot, space)
 * between digit groups — e.g. 312-555-0100, 03/14/1979, 8 4 0 2 — as one token each.
 */

export type NumberMaskResult = {
  masked: string;
  /** slot → exact digit span from source (e.g. "3602", "123-45-6789") */
  slotToDigits: Map<number, string>;
  hadPlaceholders: boolean;
};

/**
 * Digit chains for masking: one placeholder per phone/ID-style phrase (pass-through).
 * Includes optional parentheses around area-code style groups, e.g. (555) 123-4567.
 */
const DIGIT_CHAIN =
  /(?:\(\d+\)|\b\d+)(?:(?:[-–—./]|\s+)(?:\(\d+\)|\d+))*/g;

export function applyNumberPlaceholders(text: string): NumberMaskResult {
  if (!text) {
    return { masked: text, slotToDigits: new Map(), hadPlaceholders: false };
  }

  const slotToDigits = new Map<number, string>();
  let slot = 1;
  const masked = text.replace(DIGIT_CHAIN, (span) => {
    const n = slot++;
    slotToDigits.set(n, span);
    return `NUM_${n}`;
  });

  return {
    masked,
    slotToDigits,
    hadPlaceholders: slotToDigits.size > 0,
  };
}

export function restoreNumberPlaceholders(translated: string, slotToDigits: Map<number, string>): string {
  if (!translated || slotToDigits.size === 0) return translated;

  let out = translated;
  const slots = [...slotToDigits.entries()].sort((a, b) => b[0] - a[0]);
  for (const [n, digits] of slots) {
    const re = new RegExp(`NUM_${n}(?!\\d)`, "g");
    out = out.replace(re, () => digits);
  }
  return out;
}

export function numberPlaceholderPromptRule(maxSlot: number): string {
  if (maxSlot <= 0) return "";
  return (
    `NUMERIC PLACEHOLDERS:\n` +
    `- The user message may contain NUM_1, NUM_2, … (up to NUM_${maxSlot}) representing **verbatim** digit spans from speech (phones, IDs, dates — may include hyphens, slashes, or spaces inside the original span).\n` +
    `- Pass through each NUM_n unchanged in meaning: copy the token EXACTLY in place — do not spell as words, summarize, merge/split runs, convert numeral systems, or reorder.\n` +
    `- Do not add spaces inside the token (e.g. keep NUM_1, not NUM_ 1).\n\n`
  );
}
