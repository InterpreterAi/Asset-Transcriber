import type { CanonToken } from "../types/canon-token";

/**
 * Stable Soniox token id scoped to the current websocket message.
 *
 * Never key solely on start_ms / end_ms / reused per-message indexes —
 * distinct tokens can share timestamps and would collide.
 * Prefer provider index when present, otherwise messageSeq + arrIndex.
 */
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
  if (typeof ti === "number" && Number.isFinite(ti)) {
    return `sx-msg-${args.messageSeq}-idx-${ti}`;
  }
  const idRaw = args.id;
  if (typeof idRaw === "string" && idRaw.trim()) {
    return `sx-msg-${args.messageSeq}-id-${idRaw.trim()}`;
  }
  // Always include message + array position so shared timestamps survive.
  const sm = typeof args.start_ms === "number" ? args.start_ms : "x";
  const em = typeof args.end_ms === "number" ? args.end_ms : "x";
  return `sx-msg-${args.messageSeq}-${args.arrIndex}-${sm}-${em}`;
}

export function committedHasTokenId(committed: readonly CanonToken[], tokenId: string): boolean {
  return committed.some(t => t.token_id === tokenId);
}

/**
 * Overlap-based deletion is intentionally disabled for Original integrity.
 * Confirmed tokens are never dropped because another token shares text/timing.
 */
export function committedHasOverlappingFinal(
  _committed: readonly CanonToken[],
  _ct: CanonToken,
): boolean {
  return false;
}

/**
 * Suffix-overlap paint reconciliation is disabled — never slice confirmed text.
 * Temporary hypotheses are replaced wholesale by the latest non-final set.
 */
export function reconcilePaintSuffixTokens(
  _committed: readonly CanonToken[],
  paint: readonly CanonToken[],
): CanonToken[] {
  return [...paint];
}
