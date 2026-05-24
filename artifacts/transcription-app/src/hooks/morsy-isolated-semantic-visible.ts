/**
 * Presentation-only helpers for Basic · Morsy Urgent + `morsy-intercall-isolated-experiment`.
 * Does **not** own transcript authority — callers still use `{@link lockedCommittedFinalOriginal}` alone for canonical finals.
 */

export type MorsyIsolatedPresentationContext = {
  planTypeLower: string;
  segmentBehaviorMode: string;
};

/** Dual gate: semantic streaming UX (triple-span host, NF debounce, calmer pivots). */
export function morsyIsolatedSemanticPresentationEnabled(ctx: MorsyIsolatedPresentationContext): boolean {
  return ctx.planTypeLower.trim() === "morsy-urgent" && ctx.segmentBehaviorMode === "morsy-intercall-isolated-experiment";
}

export type MorsyCanonPromotionScratch = {
  /** Last Soniox-locked UTF-16 length observed while promoting visible boundary (canon-stable clock). */
  lockedLenTracked: number;
  /** Timestamp (epoch ms): start of idle window after canonical growth paused. */
  quietSinceMs: number;
};

export function resetMorsyCanonPromotionScratch(nowMs: number): MorsyCanonPromotionScratch {
  return { lockedLenTracked: 0, quietSinceMs: nowMs };
}

/** Advance `boundaryUtf16` toward `locked.length` using post-growth idle window + numeric-tail guard. Boundary never retracts outside caller. */
export function stepVisibleCommittedBoundaryUtf16(args: {
  locked: string;
  boundaryUtf16: number;
  scratch: MorsyCanonPromotionScratch;
  nowMs: number;
}): { boundaryUtf16: number; scratch: MorsyCanonPromotionScratch; promoted: boolean } {
  let { lockedLenTracked, quietSinceMs } = args.scratch;
  if (args.locked.length !== lockedLenTracked) {
    lockedLenTracked = args.locked.length;
    quietSinceMs = args.nowMs;
  }
  let boundary = Math.min(args.boundaryUtf16, args.locked.length);
  const tentativeTail = args.locked.slice(boundary);
  let promoted = false;
  if (tentativeTail.length > 0) {
    const tailScan = tentativeTail.slice(Math.max(0, tentativeTail.length - 140));
    const numericHeavy =
      /\d/.test(tailScan) ||
      /\$|€|£|USD|EUR|\b(?:invoice|receipt|order|acct|#\d+)\b/i.test(tailScan);
    const idleNeedMs = numericHeavy ? 460 : 220;
    const minTentUtf16BeforePromote = 5;
    if (
      tentativeTail.length >= minTentUtf16BeforePromote &&
      args.nowMs - quietSinceMs >= idleNeedMs
    ) {
      boundary = args.locked.length;
      promoted = true;
      quietSinceMs = args.nowMs;
    }
  }
  return {
    boundaryUtf16: boundary,
    scratch: { lockedLenTracked, quietSinceMs },
    promoted,
  };
}

export function morsyIsolatedVisibleNfDebounceMs(candidateUtf16: string): number {
  const trim = candidateUtf16.trimEnd();
  const tail = trim.slice(Math.max(0, trim.length - 120));
  const numericHeavy =
    /\d/.test(tail) ||
    /\$|€|£|¢|(?:\d+[.,])\d+|(?:usd|eur|gbp)\b/i.test(tail.trim());
  if (numericHeavy) return 360;
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
