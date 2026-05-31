/**
 * Intercall canon path (Chunk V2 OFF, Clean OFF): prove whether rendered translation
 * diverges from the latest full OpenAI response after stable growth / prefix lock.
 * Console only — may contain PHI; dev / Rodriguez evidence runs.
 */

import type { MorsyCanonTranslationPrefixState } from "./morsy-urgent-canon-translation-prefix";

let liveUpdateSeq = 0;

export function nextCanonAnchoringLiveSeq(): number {
  liveUpdateSeq += 1;
  return liveUpdateSeq;
}

export function canonAnchoringDiagEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    const v = localStorage.getItem("interpreterai_canon_anchoring_diag");
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export type CanonAnchoringLiveLog = {
  seq: number;
  rowId: string;
  phase: "live_update" | "live_rejected" | "live_aborted" | "final_update";
  requestLatencyMs?: number;
  /** A — full visibleText sent to POST /translate */
  visibleTextSent: string;
  /** stableText snapshot at dispatch (before fetch) */
  stableTextAtDispatch: string;
  /** stableText snapshot when response arrived (may differ if finals landed mid-flight) */
  stableTextAtResponse: string;
  volatileTailAtDispatch: string;
  /** B — full translation returned by OpenAI */
  translationReturned: string;
  /** C — translation rendered in UI after prefix lock (empty if paint skipped) */
  translationRendered: string;
  prefixLockApplied: boolean;
  prefixLock?: {
    lockedStableBefore: string;
    lockedStableAfter: string;
    lockedPrefixBefore: string;
    lockedPrefixAfter: string;
    derivedLiveTail: string;
    composedBeforePaint: string;
    stableGrewThisPaint: boolean;
  };
  /** Previous cell content before this paint */
  previousRendered: string;
  divergences: {
    /** composed ≠ full model response (prefix lock reshaped output) */
    composedDiffersFromReturned: boolean;
    /** DOM ≠ full model response */
    renderedDiffersFromReturned: boolean;
    /** DOM ≠ composed (paint bug or prefix-live DOM split) */
    renderedDiffersFromComposed: boolean;
    /** stable grew while request was in flight */
    stableGrewDuringFetch: boolean;
    /** visible at dispatch ≠ stable (grey NF tail was included in OpenAI input) */
    visibleIncludesVolatileTail: boolean;
  };
  rejectReason?: string;
};

function stableGrewDuringFetch(dispatchStable: string, responseStable: string): boolean {
  const d = dispatchStable.trim();
  const r = responseStable.trim();
  return r.length > d.length && (d.length === 0 || r.startsWith(d));
}

export function logCanonAnchoringLiveUpdate(args: CanonAnchoringLiveLog): void {
  if (!canonAnchoringDiagEnabled()) return;
  console.info("[canon_anchoring_live]", args);
}

export function buildPrefixLockPaintMeta(
  prefixBefore: MorsyCanonTranslationPrefixState,
  prefixAfter: MorsyCanonTranslationPrefixState,
  paint: {
    locked: string;
    live: string;
    composed: string;
  },
): CanonAnchoringLiveLog["prefixLock"] {
  const prevStable = prefixBefore.lockedStableSource.trim();
  const nextStable = prefixAfter.lockedStableSource.trim();
  return {
    lockedStableBefore: prefixBefore.lockedStableSource,
    lockedStableAfter: prefixAfter.lockedStableSource,
    lockedPrefixBefore: prefixBefore.lockedTranslationPrefix,
    lockedPrefixAfter: prefixAfter.lockedTranslationPrefix,
    derivedLiveTail: paint.live,
    composedBeforePaint: paint.composed,
    stableGrewThisPaint:
      nextStable.length > prevStable.length &&
      (prevStable.length === 0 || nextStable.startsWith(prevStable)),
  };
}
