/** Longest-common-prefix reconciliation for volatile hypothesis text. */

export function lcpLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  for (; i < n; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) break;
  }
  return i;
}

export function reconcileHypothesisVolatile(oldText: string, newFull: string): string {
  if (newFull.length >= oldText.length && newFull.startsWith(oldText)) return newFull;
  if (oldText.startsWith(newFull)) return oldText;
  const l = lcpLength(oldText, newFull);
  return oldText.slice(0, l) + newFull.slice(l);
}
