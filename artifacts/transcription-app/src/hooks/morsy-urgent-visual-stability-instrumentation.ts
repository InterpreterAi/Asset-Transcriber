/**
 * **Basic · `morsy-urgent` only**: layout / churn probe — committed `Text` node identity, NF rewrites,
 * translation cell height deltas, transcript row markup.
 *
 * **Enable (reload):**
 * ```ts
 * localStorage.setItem("interpreterai_morsy_urgent_visual_stability_trace", "1")
 * ```
 * **Ring:** `globalThis.__interpreterAiMorsyUrgentVisualStabilityTrace` — survives prod `esbuild` stripping of `console.*`.
 * **Probe:** `globalThis.__interpreterAiMorsyUrgentVisualStabilityTraceProbe`.
 *
 * PHI: clip strings in DevTools payloads only.
 */

const TRACE_FLAG_LS = "interpreterai_morsy_urgent_visual_stability_trace";
export const MORSY_URGENT_VISUAL_STABILITY_TRACE_FLAG = TRACE_FLAG_LS;
const RING_KEY = "__interpreterAiMorsyUrgentVisualStabilityTrace";
const PROBE_KEY = "__interpreterAiMorsyUrgentVisualStabilityTraceProbe";
const RING_CAP = 12_500;

export type VisualStabilityRingEntry = {
  tag: string;
  perfMs: number;
  payload: unknown;
};

export type CommittedSubtreeSummary = {
  spanOrdinal: number | null;
  childSlotCount: number;
  committedTextOrdinal: number | null;
  firstChildNodeTypeName: string;
  textLenUtf16IfText: number;
};

/** Session-scratch node ordinals — opaque identities for correlating churn in one page session. */
let nextOrdinal = 1;
const nodeOrdinal = new WeakMap<object, number>();

export function ordinalOf(o: unknown): number | null {
  if (!o || (typeof o !== "object" && typeof o !== "function")) return null;
  const hit = nodeOrdinal.get(o as object);
  if (hit !== undefined) return hit;
  const id = nextOrdinal++;
  nodeOrdinal.set(o as object, id);
  return id;
}

const lastGeometryBySegment = new Map<
  string,
  { rowH: number; transCellH: number; committedPH: number }
>();

/** keyed by ordinal(committedSpan) → last ordinal(first TEXT child under span) */
const lastCommittedTextOrdBySpanOrd = new Map<number, number | null>();

export function summarizeCommittedSubtree(committedSpan: HTMLElement): CommittedSubtreeSummary {
  const spanOrdinal = ordinalOf(committedSpan);
  const first = committedSpan.firstChild;
  const firstChildNodeTypeName =
    first === null ? "NONE" : first.nodeType === Node.TEXT_NODE ? "TEXT" : `TYPE_${first.nodeType}`;
  return {
    spanOrdinal,
    childSlotCount: committedSpan.childNodes.length,
    committedTextOrdinal: first && first.nodeType === Node.TEXT_NODE ? ordinalOf(first) : null,
    firstChildNodeTypeName,
    textLenUtf16IfText: first?.nodeType === Node.TEXT_NODE
      ? (first as Text).data.length
      : (committedSpan.textContent ?? "").length,
  };
}

/** Prove whether the subtree’s first text node instance changed vs prior sample per committed span ordinal. */
export function probeCommittedFirstTextWitness(committedSpan: HTMLElement | null | undefined): {
  connected: boolean;
  rotatedFirstTextVersusPriorSampleExclusive: boolean;
  subtree: CommittedSubtreeSummary | null;
} {
  if (!committedSpan || !committedSpan.isConnected) return { connected: false, rotatedFirstTextVersusPriorSampleExclusive: false, subtree: null };

  const subtree = summarizeCommittedSubtree(committedSpan);
  const sOrd = subtree.spanOrdinal;
  const txtOrdNow = subtree.committedTextOrdinal;
  let rotated = false;

  if (typeof sOrd === "number") {
    const prev = lastCommittedTextOrdBySpanOrd.get(sOrd);
    if (prev !== undefined && prev !== txtOrdNow) rotated = true;
    lastCommittedTextOrdBySpanOrd.set(sOrd, txtOrdNow);
  }

  return {
    connected: true,
    rotatedFirstTextVersusPriorSampleExclusive: rotated,
    subtree,
  };
}

export function resetVisualStabilityBaselines(): void {
  lastCommittedTextOrdBySpanOrd.clear();
  lastGeometryBySegment.clear();
}

function ensureRing(): VisualStabilityRingEntry[] {
  const g = globalThis as Record<string, unknown>;
  let r = g[RING_KEY];
  if (!Array.isArray(r)) {
    r = [];
    g[RING_KEY] = r;
  }
  return r as VisualStabilityRingEntry[];
}

function touchProbe(patch: Record<string, unknown>): void {
  try {
    const g = globalThis as Record<string, unknown>;
    const prev =
      g[PROBE_KEY] !== null && typeof g[PROBE_KEY] === "object"
        ? { ...(g[PROBE_KEY] as Record<string, unknown>) }
        : {};
    g[PROBE_KEY] = { ...prev, ...patch };
  } catch {
    /* ignore */
  }
}

/** Registered from `useTranscription`; default off until mounted. */
let basicMorsyGate: () => boolean = () => false;

export function registerBasicMorsyUrgentVisualStabilityTraceGate(gate: () => boolean): () => void {
  basicMorsyGate = gate;
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(TRACE_FLAG_LS) === "1") {
      ensureRing();
      touchProbe({
        gateRegisteredPerfMs: typeof performance !== "undefined" ? performance.now() : 0,
      });
    }
  } catch {
    /* ignore */
  }
  return () => {
    basicMorsyGate = () => false;
  };
}

export function morsyUrgentVisualStabilityTraceEnabled(): boolean {
  try {
    if (!basicMorsyGate()) return false;
    if (typeof localStorage === "undefined" || localStorage.getItem(TRACE_FLAG_LS) !== "1") {
      return false;
    }
    const ring = ensureRing();
    touchProbe({
      gateAndFlagVisualActivePerfMs: typeof performance !== "undefined" ? performance.now() : 0,
      ringLen: ring.length,
    });
    return true;
  } catch {
    return false;
  }
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}\u2026`;
}

function emit(tag: string, payload: Record<string, unknown>): void {
  try {
    const ring = ensureRing();
    ring.push({
      tag,
      perfMs: typeof performance !== "undefined" ? performance.now() : 0,
      payload,
    });
    const over = ring.length - RING_CAP;
    if (over > 0) ring.splice(0, over);
  } catch {
    /* ignore */
  }
  console.info(tag, payload);
}

export function emitVisualStabilitySegmentRowCreated(args: {
  segmentId: string;
  stackingLayoutSemantic: boolean;
  rowOrdinal: number | null;
  committedSpanOrdinal: number | null;
  nfOrdinal: number | null;
  canonPrimeCommittedPath?: boolean;
}): void {
  if (!morsyUrgentVisualStabilityTraceEnabled()) return;
  emit("[morsy_visual_stability_row]", args);
}

export function emitVisualStabilitySegmentDetached(args: {
  phase: string;
  segmentId?: string | null;
  witness?: Record<string, unknown>;
}): void {
  if (!morsyUrgentVisualStabilityTraceEnabled()) return;
  emit("[morsy_visual_stability_segment_detach]", args);
}

export function emitVisualStabilityCommittedDomProof(args: {
  source: string;
  segmentId: string;
  domWriteKind: "noop_synced" | "append_incremental_locked" | "full_reconcile_mismatch_fallback";
  deltaUtf16Len: number;
  lockedUtf16Len: number;
  witness: CommittedSubtreeSummary;
  firstTextNodeRotatedVersusPriorSample: boolean;
}): void {
  if (!morsyUrgentVisualStabilityTraceEnabled()) return;
  emit("[morsy_visual_stability_committed]", args);
}

export function emitVisualStabilityNfFrame(args: {
  canonAppendWs?: boolean;
  segmentId?: string | null;
  nfRawUtf16Len: number;
  nfDomUtf16Before: number;
  nfDomUtf16After: number;
  nfFullReplaceFlagMsg: boolean;
  speakerTailKeyChanged?: boolean;
  nfDomOrdinal: number | null;
  nfWriteSource: string;
}): void {
  if (!morsyUrgentVisualStabilityTraceEnabled()) return;
  emit("[morsy_visual_stability_nf]", {
    ...args,
    nfDomDeltaUtf16: args.nfDomUtf16After - args.nfDomUtf16Before,
  });
}

export function emitVisualStabilityTranslationGeometry(args: {
  segmentId: string;
  phase: string;
  isFinalPaint: boolean;
  transOrdinal: number | null;
  transCellUtf16Peek: string;
  transCellHNow: number;
  transStableUtf16Len: number;
  transLiveUtf16Len: number;
  rowOrdinal: number | null;
  rowOffsetHeightNow: number;
  colOrigH: number;
  colTransH: number;
  committedSpanOrdinal: number | null;
  committedParagraphHGuess: number;
  scrollParentOrdinal: number | null;
  scrollParentOverflowAnchor: string;
  committedBranchTextWitness: Record<string, unknown>;
}): void {
  if (!morsyUrgentVisualStabilityTraceEnabled()) return;
  const prev = lastGeometryBySegment.get(args.segmentId);

  emit("[morsy_visual_stability_translation_geometry]", {
    ...args,
    rowHeightDeltaVersusPriorSample: prev === undefined ? null : args.rowOffsetHeightNow - prev.rowH,
    transCellDeltaVersusPriorSample: prev === undefined ? null : args.transCellHNow - prev.transCellH,
    committedParagraphDeltaGuess:
      prev === undefined ? null : args.committedParagraphHGuess - prev.committedPH,
  });

  lastGeometryBySegment.set(args.segmentId, {
    rowH: args.rowOffsetHeightNow,
    transCellH: args.transCellHNow,
    committedPH: args.committedParagraphHGuess,
  });
}

/** Optional: semantic-layer NF throttle flush instrumentation. */
export function emitVisualStabilityNfSemanticFlush(args: {
  segmentId: string;
  hardRewrite: boolean;
  nfDomUtf16Before: number;
  nfDomUtf16After: number;
  stagingUtf16Peek: string;
}): void {
  if (!morsyUrgentVisualStabilityTraceEnabled()) return;
  emit("[morsy_visual_stability_nf_semantic_flush]", {
    ...args,
    nfDomDeltaUtf16: args.nfDomUtf16After - args.nfDomUtf16Before,
    stagingPeek: clip(args.stagingUtf16Peek, 120),
  });
}

export function emitVisualStabilityTranscriptDomReset(args: { phase: string; clearedContainer: boolean }): void {
  if (!morsyUrgentVisualStabilityTraceEnabled()) return;
  emit("[morsy_visual_stability_dom_reset]", args);
}

(() => {
  try {
    if (typeof localStorage === "undefined" || localStorage.getItem(TRACE_FLAG_LS) !== "1") return;
    ensureRing();
    touchProbe({
      moduleEvalPerfMs: typeof performance !== "undefined" ? performance.now() : 0,
      module: "morsy-urgent-visual-stability-instrumentation",
    });
  } catch {
    /* ignore */
  }
})();
