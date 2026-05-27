import type { CanonToken } from "../types/canon-token";

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

/** Speaker/language ownership from committed stabilized finals only. */
export function deriveStructuralOwnership(committed: readonly CanonToken[]): {
  speaker?: string;
  language?: string;
} {
  const sp = new Map<string, number>();
  const lg = new Map<string, number>();
  for (const t of committed) {
    const s = norm(t.speaker);
    const l = norm(t.language);
    if (s) sp.set(s, (sp.get(s) ?? 0) + 1);
    if (l) lg.set(l, (lg.get(l) ?? 0) + 1);
  }
  const pick = (m: Map<string, number>): string | undefined => {
    let best: string | undefined;
    let n = 0;
    for (const [k, v] of m) {
      if (v > n) {
        best = k;
        n = v;
      }
    }
    return best;
  };
  return { speaker: pick(sp), language: pick(lg) };
}
