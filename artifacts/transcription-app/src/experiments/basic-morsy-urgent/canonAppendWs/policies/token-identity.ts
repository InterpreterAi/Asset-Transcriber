import type { CanonToken } from "../types/canon-token";
import { joinCanonText } from "../types/canon-token";

/** Stable Soniox token id — no final/non-final suffix (avoids F/N duplicate commits). */
export function stableSonioxTokenId(args: {
  token_index?: unknown;
  index?: unknown;
  id?: unknown;
  start_ms?: unknown;
  end_ms?: unknown;
  messageSeq: number;
  arrIndex: number;
}): string {
  const ti = args.token_index ?? args.index;
  if (typeof ti === "number" && Number.isFinite(ti)) return `sx-idx-${ti}`;
  const idRaw = args.id;
  if (typeof idRaw === "string" && idRaw.trim()) return idRaw.trim();
  const sm = args.start_ms;
  const em = args.end_ms;
  if (typeof sm === "number" && typeof em === "number") return `sx-${sm}-${em}`;
  return `t-${args.messageSeq}-${args.arrIndex}`;
}

export function committedHasTokenId(committed: readonly CanonToken[], tokenId: string): boolean {
  return committed.some(t => t.token_id === tokenId);
}

/** Surface + coarse timing overlap dedupe for correction finals. */
export function committedHasOverlappingFinal(
  committed: readonly CanonToken[],
  ct: CanonToken,
): boolean {
  for (const c of committed) {
    if (c.text !== ct.text) continue;
    if (c.token_id === ct.token_id) return true;
    const cs = c.start_ms;
    const ce = c.end_ms;
    const ns = ct.start_ms;
    const ne = ct.end_ms;
    if (cs === undefined || ce === undefined || ns === undefined || ne === undefined) return true;
    if (Math.max(cs, ns) <= Math.min(ce, ne)) return true;
  }
  return false;
}

/** Extract paint tokens whose joined text continues after committed suffix overlap. */
export function reconcilePaintSuffixTokens(
  committed: readonly CanonToken[],
  paint: readonly CanonToken[],
): CanonToken[] {
  const C = joinCanonText(committed);
  const P = joinCanonText(paint);
  if (!P.length) return [];

  let maxOverlap = 0;
  const maxCheck = Math.min(C.length, P.length);
  for (let k = maxCheck; k > 0; k--) {
    if (C.slice(-k) === P.slice(0, k)) {
      maxOverlap = k;
      break;
    }
  }
  if (maxOverlap >= P.length) return [];

  let skip = maxOverlap;
  const out: CanonToken[] = [];
  for (const t of paint) {
    const len = t.text.length;
    if (skip >= len) {
      skip -= len;
      continue;
    }
    const slice = skip > 0 ? t.text.slice(skip) : t.text;
    skip = 0;
    if (slice.length) {
      out.push({ ...t, text: slice, is_final: true });
    }
  }
  return out;
}
