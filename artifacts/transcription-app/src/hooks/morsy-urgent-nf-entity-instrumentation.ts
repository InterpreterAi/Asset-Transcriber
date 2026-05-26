/**
 * NF entity / DOM diff telemetry (**Basic · `morsy-urgent` + canonAppendWs**).
 *
 * ```ts
 * localStorage.setItem("interpreterai_morsy_urgent_nf_entity_trace", "1")
 * ```
 * Ring: `globalThis.__interpreterAiMorsyUrgentNfEntityTrace`
 */

const TRACE_FLAG_LS = "interpreterai_morsy_urgent_nf_entity_trace";
const RING_KEY = "__interpreterAiMorsyUrgentNfEntityTrace";
const RING_CAP = 8_000;

export type NfEntityTailClass = "none" | "weak_digits" | "strong_entity";

export type NfEntityTraceEntry = {
  tag: "[morsy_nf_entity]";
  perfMs: number;
  segmentId?: string | null;
  nfRawUtf16Len: number;
  nfSmoothUtf16Len: number;
  nfHullUtf16Len: number;
  tailClass: NfEntityTailClass;
  monotoneHoldSkippedShrink: boolean;
  domApply: "noop" | "append" | "delete_replace" | "full_replace";
};

const counters = {
  msgs: 0,
  noop: 0,
  append: 0,
  delete_replace: 0,
  full_replace: 0,
  monotone_hold: 0,
};

export function nfEntityInstrumentationEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(TRACE_FLAG_LS) === "1";
  } catch {
    return false;
  }
}

function ring(): NfEntityTraceEntry[] {
  const g = globalThis as Record<string, unknown>;
  let r = g[RING_KEY];
  if (!Array.isArray(r)) {
    r = [];
    g[RING_KEY] = r;
  }
  return r as NfEntityTraceEntry[];
}

export function nfEntityInstrumentationTouchProbe(patch: Record<string, unknown>): void {
  try {
    const g = globalThis as Record<string, unknown>;
    const pk = "__interpreterAiMorsyUrgentNfEntityTraceProbe";
    const prev =
      g[pk] !== null && typeof g[pk] === "object" ? { ...(g[pk] as Record<string, unknown>) } : {};
    g[pk] = { ...prev, ...patch, counters: { ...counters } };
  } catch {
    /* ignore */
  }
}

export function emitNfEntityTrace(entry: Omit<NfEntityTraceEntry, "tag" | "perfMs">): void {
  const full: NfEntityTraceEntry = {
    ...entry,
    tag: "[morsy_nf_entity]",
    perfMs: typeof performance !== "undefined" ? performance.now() : 0,
  };
  counters.msgs++;
  if (full.domApply === "noop") counters.noop++;
  else if (full.domApply === "append") counters.append++;
  else if (full.domApply === "delete_replace") counters.delete_replace++;
  else if (full.domApply === "full_replace") counters.full_replace++;
  if (full.monotoneHoldSkippedShrink) counters.monotone_hold++;

  try {
    const r = ring();
    r.push(full);
    const over = r.length - RING_CAP;
    if (over > 0) r.splice(0, over);
  } catch {
    /* ignore */
  }

  nfEntityInstrumentationTouchProbe({ lastEmitPerfMs: full.perfMs });
  console.info(full.tag, full);
}

export function nfEntityInstrumentationResetCounters(): void {
  counters.msgs = 0;
  counters.noop = 0;
  counters.append = 0;
  counters.delete_replace = 0;
  counters.full_replace = 0;
  counters.monotone_hold = 0;
}
