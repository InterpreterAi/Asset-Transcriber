/**
 * Wraps ASCII digit runs so the model cannot spell them out or reorder them.
 * Restore preserves the exact transcribed numeric string.
 */

export type NumberMaskResult = {
  masked: string;
  /** slot → exact digits from source (e.g. "3602") */
  slotToDigits: Map<number, string>;
  hadPlaceholders: boolean;
};

export function applyNumberPlaceholders(text: string): NumberMaskResult {
  if (!text) {
    return { masked: text, slotToDigits: new Map(), hadPlaceholders: false };
  }

  const slotToDigits = new Map<number, string>();
  let slot = 1;
  const masked = text.replace(/\b\d+\b/g, (digits) => {
    const n = slot++;
    slotToDigits.set(n, digits);
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
    `- The user message may contain NUM_1, NUM_2, … (up to NUM_${maxSlot}) representing exact digit sequences from speech recognition.\n` +
    `- Copy each NUM_n token EXACTLY in place in your output — do not spell numbers as words, do not convert digits to another numeral system, do not reorder or merge tokens.\n` +
    `- Do not add spaces inside the token (e.g. keep NUM_1, not NUM_ 1).\n\n`
  );
}
