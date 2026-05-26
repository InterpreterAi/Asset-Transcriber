/** Longest-common-prefix reconciliation for volatile hypothesis text. */

export function lcpLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  for (; i < n; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) break;
  }
  return i;
}

/** Typical Soniox NF splice: `"2026"` then `"2026ed"` — strip spurious `"ed"` (no `\b` between `6` and `e`). */
function repairAmbiguousHypothesisGlitch(text: string): string {
  return text.replace(/\d{4}ed\b/gu, m => m.slice(0, 4));
}

export function reconcileHypothesisVolatile(oldText: string, newFull: string): string {
  const cleanedNew = repairAmbiguousHypothesisGlitch(newFull);
  let merged: string;
  if (
    cleanedNew.length >= oldText.length &&
    cleanedNew.startsWith(oldText)
  ) {
    merged = cleanedNew;
  } else if (oldText.startsWith(cleanedNew)) {
    merged = oldText;
  } else {
    const l = lcpLength(oldText, cleanedNew);
    merged = oldText.slice(0, l) + cleanedNew.slice(l);
  }
  return repairAmbiguousHypothesisGlitch(merged);
}
