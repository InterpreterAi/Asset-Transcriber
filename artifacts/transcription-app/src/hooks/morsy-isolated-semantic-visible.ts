/**
 * Presentation-only helpers for Basic · Morsy Urgent + `morsy-intercall-isolated-experiment`.
 * Does **not** own transcript authority — callers still use `{@link lockedCommittedFinalOriginal}` alone for canonical finals.
 */

export type MorsyIsolatedPresentationContext = {
  planTypeLower: string;
  segmentBehaviorMode: string;
};

/** Dual gate: calm NF debounce / translation pacing (does not reshape committed originals). */
export function morsyIsolatedSemanticPresentationEnabled(ctx: MorsyIsolatedPresentationContext): boolean {
  return ctx.planTypeLower.trim() === "morsy-urgent" && ctx.segmentBehaviorMode === "morsy-intercall-isolated-experiment";
}

export type MorsyCanonPromotionScratch = {
  /** Last Soniox-locked UTF-16 length observed while promoting visible boundary (canon-stable clock). */
  lockedLenTracked: number;
  /** Timestamp (epoch ms): start of idle window after canonical growth paused. */
  quietSinceMs: number;
  /**
   * When visible boundary trails `locked`, first backlog observation (`nowMs`); `null` when caught up.
   * Drives **`MORSY_COMMIT_VISIBLE_MAX_LAG_BEHIND_CANON_MS`** ceiling under continuous finals.
   */
  backlogAnchorMs: number | null;
};

/** Tune with side-by-side Intercall tests (Basic · Morsy Urgent isolated canon path only). */
export const MORSY_COMMIT_VISIBLE_MAX_LAG_BEHIND_CANON_MS = 300;

/** Floor for idle-before-promotion (entity-heavy tentative tails skew higher via `{@link promotionIdleNeedMsForTailScan}`). */
export const MORSY_COMMIT_VISIBLE_IDLE_BASE_MS = 165;

export function resetMorsyCanonPromotionScratch(nowMs: number): MorsyCanonPromotionScratch {
  return { lockedLenTracked: 0, quietSinceMs: nowMs, backlogAnchorMs: null };
}

/** Tentative-tail scan (typically last ≤140 UTF-16) → bounded idle-before-promotion. */
export function promotionIdleNeedMsForTailScan(tailScan: string): number {
  const ts = tailScan.trim();
  if (!ts) return MORSY_COMMIT_VISIBLE_IDLE_BASE_MS;
  const numericHeavy =
    /\d/.test(ts) ||
    /\$|€|£|USD|EUR|\b(?:invoice|receipt|order|acct|#\d+)\b/i.test(ts);
  if (numericHeavy) return Math.min(MORSY_COMMIT_VISIBLE_MAX_LAG_BEHIND_CANON_MS - 5, 295);
  // Trailing capitalized token(s) — common name / entity flake while finals still drifting
  if (/(?:^|\s)[A-Z][a-z]{2,}\s*$/.test(ts)) return 235;
  if (/\b(?:called|named|meet|thank|thanks|[Mm]rs?\.|[Dd]r\.)\b[^.!?]{0,32}$/.test(ts)) return 248;
  return MORSY_COMMIT_VISIBLE_IDLE_BASE_MS;
}

/**
 * Clamp after `{@link stepVisibleCommittedBoundaryUtf16}` so **visible boundary never regresses frame-to-frame**
 * (e.g. scratch/`Math.min(boundary,lockedLen)` churn vs full-canon flashes from another writer).
 */
export function monotoneVisibleCommittedBoundaryUtf16(args: {
  prevBoundaryUtf16: number;
  steppedBoundaryUtf16: number;
  lockedLenUtf16: number;
}): number {
  return Math.min(args.lockedLenUtf16, Math.max(args.prevBoundaryUtf16, args.steppedBoundaryUtf16));
}

/** Advance visible prefix toward full `locked` (idle clustering + backlog lag ceiling). Caller should apply `{@link monotoneVisibleCommittedBoundaryUtf16}`. */
export function stepVisibleCommittedBoundaryUtf16(args: {
  locked: string;
  boundaryUtf16: number;
  scratch: MorsyCanonPromotionScratch;
  nowMs: number;
}): { boundaryUtf16: number; scratch: MorsyCanonPromotionScratch; promoted: boolean } {
  let { lockedLenTracked, quietSinceMs, backlogAnchorMs } = args.scratch;
  if (args.locked.length !== lockedLenTracked) {
    lockedLenTracked = args.locked.length;
    quietSinceMs = args.nowMs;
  }
  let boundary = Math.min(args.boundaryUtf16, args.locked.length);
  const tentativeTail = args.locked.slice(boundary);
  let promoted = false;

  if (tentativeTail.length <= 0) {
    backlogAnchorMs = null;
    return {
      boundaryUtf16: boundary,
      scratch: { lockedLenTracked, quietSinceMs, backlogAnchorMs },
      promoted: false,
    };
  }

  if (backlogAnchorMs === null) {
    backlogAnchorMs = args.nowMs;
  }

  const tailScan = tentativeTail.slice(Math.max(0, tentativeTail.length - 140));
  const idleNeedMs = promotionIdleNeedMsForTailScan(tailScan);
  /** Minimal tentative tail UTF-16 before idle-based snap (`LAG` ceiling covers very short remnants). */
  const minTentUtf16BeforeIdlePromote = 1;

  const lagBehindMs = backlogAnchorMs !== null ? args.nowMs - backlogAnchorMs : 0;
  if (lagBehindMs >= MORSY_COMMIT_VISIBLE_MAX_LAG_BEHIND_CANON_MS) {
    boundary = args.locked.length;
    promoted = true;
    quietSinceMs = args.nowMs;
    backlogAnchorMs = null;
  } else if (
    tentativeTail.length >= minTentUtf16BeforeIdlePromote &&
    args.nowMs - quietSinceMs >= idleNeedMs
  ) {
    boundary = args.locked.length;
    promoted = true;
    quietSinceMs = args.nowMs;
    backlogAnchorMs = null;
  }

  return {
    boundaryUtf16: boundary,
    scratch: { lockedLenTracked, quietSinceMs, backlogAnchorMs },
    promoted,
  };
}

export function morsyIsolatedVisibleNfDebounceMs(candidateUtf16: string): number {
  const trim = candidateUtf16.trimEnd();
  const tail = trim.slice(Math.max(0, trim.length - 120));
  const numericHeavy =
    /\d/.test(tail) ||
    /\$|€|£|¢|(?:\d+[.,])\d+|(?:usd|eur|gbp)\b/i.test(tail.trim());
  if (numericHeavy) return 260;
  if (/[.?…!，。！？-]\s*$/.test(trim)) return 70;
  return 105;
}

export function readMorsySemanticLayoutPreferredStacked(): boolean {
  try {
    return typeof globalThis.localStorage !== "undefined" &&
      globalThis.localStorage.getItem("interpreterai_morsy_semantic_layout") === "stacked";
  } catch {
    return false;
  }
}
