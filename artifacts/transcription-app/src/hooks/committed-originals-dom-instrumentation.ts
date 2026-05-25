/**
 * Renderer-integrity instrumentation for the **originals committed `<span>`** (final-only column).
 *
 * **Enable (reload):**
 *   `localStorage.setItem("interpreterai_committed_orig_dom_trace", "1")`
 * **Scope:** emits only when the hook registers the strict gate: `plan_type === "morsy-urgent"` and
 * `segmentBehaviorMode === "morsy-intercall-isolated-experiment"`. Default plans / legacy2 / non-isolated
 * modes never log even if localStorage is set.
 *
 * **`[morsy_urgent_viewport]`** / **`[morsy_urgent_nf_reflow]`** — scroll / NF layout (same gate + ring as originals).
 *
 * **Production:** Vite/`esbuild` drop `console.*` unless `VITE_KEEP_CONSOLE=1`. Entries are mirrored to
 * **`globalThis.__interpreterAiCommittedOrigDomTrace`** (ring buffer) so Track A torture runs still retain payloads in DevTools.
 * **`globalThis.__interpreterAiCommittedOrigDomTraceProbe`** merges when this module evaluates (flag `1`), when
 * `{@link registerCommittedOrigDomIntegrityTraceStrictScopeGate}` runs, and when tracing arms — use to distinguish
 * stale deploy vs gate-off vs unused chunk.
 *
 * **Morsy Urgent + isolated canon-append (`morsyUrgentAppendOnlyTranscriptDomPath`):**
 * Live committed originals are written only via **`{@link projectCommittedOriginalsVisibleUtf16}`**
 * (invoked from `paintMorsyUrgentCanonAppendCommittedOriginalsVisibleDom` and legacy flush rescue).
 * **`{@link reconcileCommittedTextNodeFromLockedString}`** is the deliberate full-canonical reconcile at
 * **`softFinalize`**. **`{@link primeMorsyIsolatedCommittedTextNode}`** primes an empty Text node at bubble creation.
 *
 * Separate legacy writers (**`target.textContent`**) still exist outside this path (`flushFinalTextRenderQueue`).
 *
 * PHI — dev consoles only (snipped text).
 */

let mutationSeq = 0;
let passiveSeq = 0;
let orchestrationSeq = 0;
/** Dedupe passive RAF/MO snapshots when fingerprint unchanged. */
let lastPassiveFingerprint = "";

/** `localStorage` key toggling `[committed_orig_dom_*]` logs (still requires `{@link registerCommittedOrigDomIntegrityTraceStrictScopeGate}` + scope). */
export const COMMITTED_ORIG_DOM_TRACE_FLAG = "interpreterai_committed_orig_dom_trace";

/** Ring buffer survives production `esbuild`/`terser` console stripping (`VITE_KEEP_CONSOLE` unset). */
export const COMMITTED_ORIG_DOM_TRACE_RING_KEY = "__interpreterAiCommittedOrigDomTrace";

/** Merge-state object on `globalThis` — proves instrumentation module ran (see module boot + register + active trace). */
export const COMMITTED_ORIG_DOM_TRACE_PROBE_KEY = "__interpreterAiCommittedOrigDomTraceProbe";

const COMMITTED_ORIG_DOM_TRACE_RING_CAP = 12_500;

export type CommittedOrigDomRingEntry = { tag: string; perfMs: number; payload: unknown };

/** Idempotent: creates an empty array on `globalThis` so deploy verification does not depend on the first emit. */
export function ensureCommittedOrigDomTraceRing(): CommittedOrigDomRingEntry[] {
  const g = globalThis as Record<string, unknown>;
  const ringKey = COMMITTED_ORIG_DOM_TRACE_RING_KEY;
  let ringUnknown = g[ringKey];
  if (!Array.isArray(ringUnknown)) {
    ringUnknown = [];
    g[ringKey] = ringUnknown;
  }
  return ringUnknown as CommittedOrigDomRingEntry[];
}

function touchCommittedOrigDomTraceProbe(patch: Record<string, unknown>): void {
  try {
    const g = globalThis as Record<string, unknown>;
    const k = COMMITTED_ORIG_DOM_TRACE_PROBE_KEY;
    const prev = g[k] !== null && typeof g[k] === "object" ? { ...(g[k] as Record<string, unknown>) } : {};
    g[k] = { ...prev, ...patch };
  } catch {
    /* ignore */
  }
}

/**
 * Narrow trace to Basic **Morsy Urgent** + isolated experiment segment (`morsy-intercall-isolated-experiment`).
 * Default is no gate — emits nothing until the hook registers a gate (typically refs + plan/mode equality).
 */
let committedOrigIntegrityTraceStrictScopeGate: () => boolean = () => false;

/** Call from `{@link use-transcription.ts}` mount; resets on unregister. */
export function registerCommittedOrigDomIntegrityTraceStrictScopeGate(gate: () => boolean): void {
  committedOrigIntegrityTraceStrictScopeGate = gate;
  /** Eager-empty ring + probe once hook mounts (so `globalThis.__interpreterAiCommittedOrigDomTrace !== undefined` after workspace load). */
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(COMMITTED_ORIG_DOM_TRACE_FLAG) === "1") {
      ensureCommittedOrigDomTraceRing();
      touchCommittedOrigDomTraceProbe({
        hookGateRegisteredPerfMs: typeof performance !== "undefined" ? performance.now() : 0,
      });
    }
  } catch {
    /* ignore */
  }
}

export function committedOrigDomIntegrityTraceEnabled(): boolean {
  try {
    if (!committedOrigIntegrityTraceStrictScopeGate()) return false;
    if (typeof localStorage === "undefined" || localStorage.getItem(COMMITTED_ORIG_DOM_TRACE_FLAG) !== "1") {
      return false;
    }
    const ring = ensureCommittedOrigDomTraceRing();
    touchCommittedOrigDomTraceProbe({
      gateAndFlagActivePerfMs: typeof performance !== "undefined" ? performance.now() : 0,
      ringLen: ring.length,
    });
    return true;
  } catch {
    return false;
  }
}

/** Clear passive dedupe (e.g. after container wipe). */
export function resetCommittedOrigDomPassiveDedupFingerprint(): void {
  lastPassiveFingerprint = "";
}

function snip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}\u2026`;
}

/** Push `{ tag, perfMs, payload }` then `console.info` (missing in stripped prod bundles — ring persists). */
function sinkCommittedOrigDomTrace(tag: string, payload: unknown): void {
  try {
    const ring = ensureCommittedOrigDomTraceRing();
    ring.push({
      tag,
      perfMs: typeof performance !== "undefined" ? performance.now() : 0,
      payload,
    });
    const overflow = ring.length - COMMITTED_ORIG_DOM_TRACE_RING_CAP;
    if (overflow > 0) ring.splice(0, overflow);
  } catch {
    /* ignore */
  }
  console.info(tag, payload);
}

export type CommittedOrigDomIntegrityMode =
  | "project_visible_prefix"
  | "reconcile_full_locked"
  | "prime_empty"
  | "legacy_flush_full_locked"
  | "legacy_flush_concat"
  | "container_wipe_innerhtml"
  | "active_committed_span_detached";

export type EmitCommittedOrigDomMutationArgs = {
  source: string;
  integrityMode: CommittedOrigDomIntegrityMode;
  span?: HTMLElement | null;
  prevText: string;
  nextText: string;
  lockedCanonFull: string;
  visibleBoundaryUtf16: number | null;
  note?: string;
};

function expectedDomForMode(args: EmitCommittedOrigDomMutationArgs): string {
  switch (args.integrityMode) {
    case "project_visible_prefix": {
      if (typeof args.visibleBoundaryUtf16 !== "number") return "";
      const b = Math.min(args.visibleBoundaryUtf16, args.lockedCanonFull.length);
      return args.lockedCanonFull.slice(0, b);
    }
    case "reconcile_full_locked":
    case "legacy_flush_full_locked":
    case "legacy_flush_concat":
      return args.lockedCanonFull;
    case "prime_empty":
      return "";
    case "container_wipe_innerhtml":
    case "active_committed_span_detached":
      return "";
    default: {
      const _u: never = args.integrityMode;
      void _u;
      return "";
    }
  }
}

/** Instrumented **committed originals** DOM text writes. */
export function emitCommittedOrigDomMutation(args: EmitCommittedOrigDomMutationArgs): void {
  if (!committedOrigDomIntegrityTraceEnabled()) return;

  const expectedDom = expectedDomForMode(args);
  const prevLen = args.prevText.length;
  const nextLen = args.nextText.length;
  const shortened = nextLen < prevLen;

  let expectedMismatchVersusMode = false;
  let lockedStartsWithCommitDom = true;

  switch (args.integrityMode) {
    case "project_visible_prefix":
      expectedMismatchVersusMode = args.nextText !== expectedDom;
      lockedStartsWithCommitDom = args.lockedCanonFull.startsWith(args.nextText);
      break;
    case "reconcile_full_locked":
    case "legacy_flush_full_locked":
    case "legacy_flush_concat":
      expectedMismatchVersusMode = args.nextText !== expectedDom;
      lockedStartsWithCommitDom =
        args.nextText === args.lockedCanonFull || args.lockedCanonFull.startsWith(args.nextText);
      break;
    case "prime_empty":
      expectedMismatchVersusMode = args.nextText !== "";
      lockedStartsWithCommitDom =
        args.lockedCanonFull.length === 0 || args.lockedCanonFull.startsWith(args.nextText);
      break;
    case "container_wipe_innerhtml":
    case "active_committed_span_detached":
      expectedMismatchVersusMode = false;
      lockedStartsWithCommitDom = true;
      break;
    default: {
      const _u: never = args.integrityMode;
      void _u;
    }
  }

  mutationSeq += 1;
  const domDivergesFromLockedCanonPrefix =
    args.nextText.length > 0 && !args.lockedCanonFull.startsWith(args.nextText);

  sinkCommittedOrigDomTrace("[committed_orig_dom_mutation]", {
    seq: mutationSeq,
    source: args.source,
    integrityMode: args.integrityMode,
    note: args.note,
    prevUtf16Len: prevLen,
    nextUtf16Len: nextLen,
    shortened,
    lockedCanonUtf16Len: args.lockedCanonFull.length,
    visibleBoundaryUtf16: args.visibleBoundaryUtf16,
    expectedMismatchVersusMode,
    lockedCanonStartsWithDomUtf16: lockedStartsWithCommitDom,
    domDivergesFromLockedCanonPrefix,
    prevPeek: snip(args.prevText, 120),
    nextPeek: snip(args.nextText, 120),
    expectedPeek: snip(expectedDom, 120),
    lockedCanonHeadPeek: snip(args.lockedCanonFull, 96),
    spanDisconnected: Boolean(args.span && !args.span.isConnected),
  });
}

export type EmitCommittedOrigDomPassiveSampleArgs = {
  sourceTag: string;
  committedSpan: HTMLSpanElement | null | undefined;
  lockedCanonFull: string;
  visibleBoundaryUtf16: number | null;
  dedupBypass?: boolean;
};

/**
 * Passive rAF/MO sample — no DOM write implied; detects shrink/repaint without a preceding mutation log.
 */
export function emitCommittedOrigDomPassiveSample(args: EmitCommittedOrigDomPassiveSampleArgs): void {
  if (!committedOrigDomIntegrityTraceEnabled()) return;
  const domText = args.committedSpan?.textContent ?? "";
  const fingerprint = `${domText}\n${args.lockedCanonFull.length}\n${String(args.visibleBoundaryUtf16)}`;
  if (!args.dedupBypass && fingerprint === lastPassiveFingerprint) return;
  lastPassiveFingerprint = fingerprint;

  const expectedProj =
    typeof args.visibleBoundaryUtf16 === "number"
      ? args.lockedCanonFull.slice(
          0,
          Math.min(args.visibleBoundaryUtf16, args.lockedCanonFull.length),
        )
      : "";
  const connected = Boolean(args.committedSpan?.isConnected);
  const mismatch =
    typeof args.visibleBoundaryUtf16 === "number" && connected ? domText !== expectedProj : false;
  const domDivergesFromLockedCanonPrefix = domText.length > 0 && !args.lockedCanonFull.startsWith(domText);

  passiveSeq += 1;
  sinkCommittedOrigDomTrace("[committed_orig_dom_passive]", {
    seq: passiveSeq,
    sourceTag: args.sourceTag,
    connected,
    domUtf16Len: domText.length,
    lockedUtf16Len: args.lockedCanonFull.length,
    visibleBoundaryUtf16: args.visibleBoundaryUtf16,
    projectionMismatchVersusCanonBoundary: mismatch,
    domDivergesFromLockedCanonPrefix,
    domPeek: snip(domText, 96),
    expectedProjectionPeek: snip(expectedProj, 96),
  });
}

export type CommittedOrigDomOrchestrationPhase =
  | "queue_cleared_discard_canon_append"
  | "queue_cleared_before_flush_iteration"
  | "queue_push"
  | "flush_iteration_begin"
  | "boundary_projection_meta"
  | "raf_tail_follow_scheduled"
  | "tail_follow_suppressed_explicit_unpinned"
  | "tail_follow_suppressed_sticky_true_fingerprint_stable"
  | "raf_scroll_verify_post_layout_scheduled"
  | "mutation_observer_raffed_sample"
  | "resize_observer_raffed_sample"
  | "segment_bubble_created"
  | "soft_finalize_entry"
  | "soft_finalize_after_reconcile"
  | "close_active_segment_boundary";

export type EmitCommittedOrigDomOrchestrationArgs = {
  phase: CommittedOrigDomOrchestrationPhase;
  source: string;
  segmentId?: string | null;
  queueLenBefore?: number;
  queueLenAfter?: number;
  prevDomUtf16Len?: number;
  nextDomUtf16Len?: number;
  lockedCanonUtf16Len?: number;
  visibleBoundaryUtf16?: number | null;
  shortened?: boolean;
  divergesFromLockedCanonPrefix?: boolean;
  /** Extra projection / queue payload (already non-PHI-safe shapes preferred). */
  detail?: Record<string, unknown>;
};

/** Queue / RAF / finalize / lifecycle (no implicit DOM write). */
export function emitCommittedOrigDomOrchestration(args: EmitCommittedOrigDomOrchestrationArgs): void {
  if (!committedOrigDomIntegrityTraceEnabled()) return;
  orchestrationSeq += 1;
  sinkCommittedOrigDomTrace("[committed_orig_dom_orchestration]", {
    seq: orchestrationSeq,
    phase: args.phase,
    source: args.source,
    segmentId: args.segmentId ?? null,
    queueLenBefore: args.queueLenBefore,
    queueLenAfter: args.queueLenAfter,
    prevDomUtf16Len: args.prevDomUtf16Len,
    nextDomUtf16Len: args.nextDomUtf16Len,
    lockedCanonUtf16Len: args.lockedCanonUtf16Len,
    visibleBoundaryUtf16: args.visibleBoundaryUtf16,
    shortened: args.shortened,
    divergesFromLockedCanonPrefix: args.divergesFromLockedCanonPrefix,
    detail: args.detail,
  });
}

/**
 * Separate from `[committed_orig_dom_*]` tails to isolate **viewport / layout** churn for Basic · Morsy Urgent torture runs.
 * Same enablement + gate as originals trace (`committedOrigDomIntegrityTraceEnabled`).
 */
export function emitMorsyUrgentViewportLayoutTrace(payload: Record<string, unknown>): void {
  if (!committedOrigDomIntegrityTraceEnabled()) return;
  sinkCommittedOrigDomTrace("[morsy_urgent_viewport]", payload);
}

/** NF / hypothesis span presentation only (not canon committed column). Same gate as viewport trace. */
export function emitMorsyUrgentNfReflowTrace(payload: Record<string, unknown>): void {
  if (!committedOrigDomIntegrityTraceEnabled()) return;
  sinkCommittedOrigDomTrace("[morsy_urgent_nf_reflow]", payload);
}

export function emitCommittedOrigDomContainerWipe(source: string): void {
  if (!committedOrigDomIntegrityTraceEnabled()) return;
  mutationSeq += 1;
  resetCommittedOrigDomPassiveDedupFingerprint();
  sinkCommittedOrigDomTrace("[committed_orig_dom_mutation]", {
    seq: mutationSeq,
    source,
    integrityMode: "container_wipe_innerhtml",
    note: "transcript_container_innerHTML_cleared",
  });
}

export type EmitCommittedOrigDomDetachPreNullArgs = {
  committedSpan: HTMLSpanElement | null | undefined;
  lockedCanonUtf16: string;
  visibleBoundaryUtf16: number | null;
};

/**
 * Bubble tear-down: log committed span snapshot before refs are cleared.
 * Call before `activeBubbleRef.current = null` where the committed span was the live target.
 */
export function emitCommittedOrigDomDetachPreNull(
  source: string,
  args: EmitCommittedOrigDomDetachPreNullArgs,
): void {
  if (!committedOrigDomIntegrityTraceEnabled()) return;
  const span = args.committedSpan ?? null;
  const domText =
    typeof span?.textContent === "string"
      ? span.textContent ?? ""
      : "";
  mutationSeq += 1;
  resetCommittedOrigDomPassiveDedupFingerprint();
  const locked = args.lockedCanonUtf16;
  const divergesPrefix = domText.length > 0 && !locked.startsWith(domText);
  sinkCommittedOrigDomTrace("[committed_orig_dom_mutation]", {
    seq: mutationSeq,
    source,
    integrityMode: "active_committed_span_detached",
    note: "refs_cleared_next_tick",
    spanConnected: !!(span?.isConnected),
    domUtf16Len: domText.length,
    lockedCanonUtf16Len: locked.length,
    visibleBoundaryUtf16: args.visibleBoundaryUtf16,
    shortened: undefined,
    domDivergesFromLockedCanonPrefix: divergesPrefix,
    lockedCanonStartsWithDom: locked.startsWith(domText),
    domPeek: snip(domText, 96),
    lockedCanonPeek: snip(locked, 96),
  });
}

// Boot: proves this chunk loaded — runs when instrumentation module evaluates (lazy with `use-transcription`).
(() => {
  try {
    if (typeof localStorage === "undefined" || localStorage.getItem(COMMITTED_ORIG_DOM_TRACE_FLAG) !== "1") return;
    ensureCommittedOrigDomTraceRing();
    touchCommittedOrigDomTraceProbe({
      moduleEvalPerfMs: typeof performance !== "undefined" ? performance.now() : 0,
      instrumentationModule: "committed-originals-dom-instrumentation",
    });
  } catch {
    /* ignore */
  }
})();
