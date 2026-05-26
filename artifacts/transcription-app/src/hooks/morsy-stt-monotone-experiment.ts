/**
 * **Optional experiment:** Basic · `morsy-urgent` + `canonAppendWs` only.
 *
 * Enables strict monotone NF (append / full clear only; no shrink, LCP rewrite, deleteData tails)
 * and append-only committed DOM on the WS hot path, and suppresses translation dispatch while active.
 *
 * Enable (same-tab):
 * `localStorage.setItem("interpreterai_morsy_stt_monotone_nf_experiment", "1")` + reload.
 */

import {
  appendDataLockedOnly,
  morsyUrgentAppendOnlyTranscriptDomPath,
  reconcileCommittedTextNodeFromLockedString,
} from "@/hooks/morsy-isolated-transcript-canonical";
import { ensureNfHypothesisStableTextNode } from "@/hooks/morsy-urgent-nf-dom-stable";

export const MORSY_STT_MONOTONE_NF_EXPERIMENT_LS = "interpreterai_morsy_stt_monotone_nf_experiment";

const RING_KEY = "__interpreterAiMorsySttMonotoneTrace";
const MAX_RING = 128;

export type MorsySttMonotoneTraceEntry = {
  t: number;
  kind:
    | "nf_clear"
    | "nf_append"
    | "nf_noop_stale_or_diverged"
    | "committed_append"
    | "committed_noop"
    | "committed_violation_skip"
    | "committed_segment_reconcile_allowed";
  detail?: Record<string, unknown>;
};

export function readMorsySttMonotoneNfExperimentEnabled(): boolean {
  try {
    return typeof globalThis.localStorage !== "undefined" &&
      globalThis.localStorage.getItem(MORSY_STT_MONOTONE_NF_EXPERIMENT_LS) === "1";
  } catch {
    return false;
  }
}

export function isMorsySttMonotoneNfExperimentActive(args: {
  planTypeLower: string;
  segmentBehaviorMode: string;
  transcriptSegIsolation: boolean;
}): boolean {
  if (!readMorsySttMonotoneNfExperimentEnabled()) return false;
  return morsyUrgentAppendOnlyTranscriptDomPath(args);
}

function sinkMonoTrace(entry: MorsySttMonotoneTraceEntry): void {
  try {
    const g = globalThis as unknown as { [RING_KEY]?: MorsySttMonotoneTraceEntry[] };
    const ring = Array.isArray(g[RING_KEY]) ? g[RING_KEY]! : [];
    ring.push(entry);
    while (ring.length > MAX_RING) ring.shift();
    g[RING_KEY] = ring;
  } catch {
    /* ignore */
  }
}

/** After `resetHypothesis` (speaker/segment NF boundary), baseline from current Soniox raw (may be empty). */
export function computeMonotoneNfVisible(prev: string, raw: string, resetHypothesis: boolean): string {
  if (resetHypothesis) {
    return raw.length === 0 ? "" : raw;
  }
  if (raw.length === 0) {
    return "";
  }
  if (prev.length === 0) {
    return raw;
  }
  if (raw.startsWith(prev)) {
    return raw;
  }
  if (prev.startsWith(raw)) {
    return prev;
  }
  return prev;
}

/**
 * NF DOM: **`appendData` only** while growing; **full clear** via `replaceData(0,len,"")` when `next === ""`.
 * Never `deleteData` on a prefix — Soniox retracts are surfaced as stale visible text until clear/reset.
 */
export function paintMonotoneNfDomStrict(
  nfSpan: HTMLElement,
  nextVisible: string,
): void {
  const tn = ensureNfHypothesisStableTextNode(nfSpan);
  const domPrev = tn.data;

  if (nextVisible === domPrev) {
    return;
  }

  if (nextVisible.length === 0) {
    if (domPrev.length > 0) {
      sinkMonoTrace({
        t: Date.now(),
        kind: "nf_clear",
        detail: { clearedUtf16: domPrev.length },
      });
      tn.replaceData(0, domPrev.length, "");
    }
    return;
  }

  if (nextVisible.startsWith(domPrev)) {
    const delta = nextVisible.slice(domPrev.length);
    if (delta.length > 0) {
      sinkMonoTrace({
        t: Date.now(),
        kind: "nf_append",
        detail: { deltaUtf16: delta.length },
      });
      tn.appendData(delta);
    }
    return;
  }

  sinkMonoTrace({
    t: Date.now(),
    kind: "nf_noop_stale_or_diverged",
    detail: { domPrevUtf16: domPrev.length, nextUtf16: nextVisible.length },
  });
}

/**
 * Committed originals: append-only vs previous DOM; **never** shorten on WS hot path.
 * Returns whether `visibleCommittedBoundary` should be set to `locked.length`.
 */
export function paintCommittedDomStrictMonotone(
  committedSpan: HTMLSpanElement,
  locked: string,
): { advanced: boolean; violation: boolean } {
  const prev = committedSpan.textContent ?? "";

  if (prev === locked) {
    sinkMonoTrace({ t: Date.now(), kind: "committed_noop" });
    return { advanced: false, violation: false };
  }

  if (prev.length === 0 || (locked.startsWith(prev) && locked.length >= prev.length)) {
    const delta = locked.slice(prev.length);
    if (delta.length > 0) {
      appendDataLockedOnly(committedSpan, delta, locked);
      sinkMonoTrace({
        t: Date.now(),
        kind: "committed_append",
        detail: { deltaUtf16: delta.length },
      });
    }
    return { advanced: true, violation: false };
  }

  sinkMonoTrace({
    t: Date.now(),
    kind: "committed_violation_skip",
    detail: { prevUtf16: prev.length, lockedUtf16: locked.length },
  });
  return { advanced: false, violation: true };
}

/** Segment boundary only: sync committed `Text` to full `locked` (allowed reset). */
export function reconcileCommittedDomSegmentBoundary(
  committedSpan: HTMLSpanElement,
  locked: string,
): void {
  sinkMonoTrace({
    t: Date.now(),
    kind: "committed_segment_reconcile_allowed",
    detail: { lockedUtf16: locked.length },
  });
  reconcileCommittedTextNodeFromLockedString(committedSpan, locked);
}

export function peekMorsySttMonotoneTraceRing(): readonly MorsySttMonotoneTraceEntry[] {
  try {
    const g = globalThis as unknown as { [RING_KEY]?: MorsySttMonotoneTraceEntry[] };
    return Array.isArray(g[RING_KEY]) ? g[RING_KEY]! : [];
  } catch {
    return [];
  }
}
