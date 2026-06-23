/**
 * Trial-hetzner ONLY — token→DOM streaming diagnosis (no behavior change).
 *
 * Enable before Start (full reload):
 *   localStorage.setItem("interpreterai_trial_hetzner_stream_trace", "1")
 *
 * After Stop:
 *   window.__trialHetznerStreamTrace.printSummary()
 *   window.__trialHetznerStreamTrace.exportRows()
 *
 * PHI: clips text — dev consoles only.
 */

import type { MorsyCanonPromotionKind } from "@/hooks/morsy-isolated-semantic-visible";

const LS_KEY = "interpreterai_trial_hetzner_stream_trace";
const RING_KEY = "__trialHetznerStreamTrace";
const RING_CAP = 8_000;

export type TrialHetznerStreamTraceRow = {
  perfMs: number;
  sinceSessionMs: number;
  kind:
    | "ws_frame"
    | "final_token"
    | "nf_paint"
    | "committed_paint"
    | "speaker_pending"
    | "speaker_confirmed"
    | "segment_close"
    | "translation_schedule";
  segmentId: string | null;
  tokenText?: string;
  isFinal?: boolean;
  speakerId?: string;
  lockedLen?: number;
  visibleBoundary?: number;
  stagingGap?: number;
  domCommittedLen?: number;
  domNfLen?: number;
  promoteReason?: MorsyCanonPromotionKind;
  idleNeedMs?: number;
  msQuietSinceGrowth?: number;
  msBacklogLag?: number | null;
  pendingSpeakerStreak?: number;
  pendingBufferedLen?: number;
  blockedReason?: string;
  note?: string;
};

type SessionState = {
  sessionStartPerfMs: number;
  rows: TrialHetznerStreamTraceRow[];
  lastWsPerfMs: number;
  lastCommittedDomLen: number;
  chunkEvents: number;
  promotionsIdleQuiet: number;
  promotionsLagCeiling: number;
  speakerPendingBlocks: number;
};

let active = false;
let planGate: () => boolean = () => false;
const state: SessionState = {
  sessionStartPerfMs: 0,
  rows: [],
  lastWsPerfMs: 0,
  lastCommittedDomLen: 0,
  chunkEvents: 0,
  promotionsIdleQuiet: 0,
  promotionsLagCeiling: 0,
  speakerPendingBlocks: 0,
};

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clip(s: string, max = 48): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function push(row: Omit<TrialHetznerStreamTraceRow, "perfMs" | "sinceSessionMs">): void {
  if (!active || !planGate()) return;
  const perfMs = perfNow();
  const sinceSessionMs = Math.round(perfMs - state.sessionStartPerfMs);
  const full: TrialHetznerStreamTraceRow = { perfMs, sinceSessionMs, ...row };
  state.rows.push(full);
  if (state.rows.length > RING_CAP) state.rows.splice(0, state.rows.length - RING_CAP);
  // eslint-disable-next-line no-console
  console.info("[trial_hetzner_stream]", full);
}

export function trialHetznerStreamTraceEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Hook registers plan gate once mounted. */
export function registerTrialHetznerStreamTracePlanGate(gate: () => boolean): void {
  planGate = gate;
  attachWindowApi();
}

export function resetTrialHetznerStreamTraceSession(): void {
  active = trialHetznerStreamTraceEnabled();
  state.sessionStartPerfMs = perfNow();
  state.rows = [];
  state.lastWsPerfMs = 0;
  state.lastCommittedDomLen = 0;
  state.chunkEvents = 0;
  state.promotionsIdleQuiet = 0;
  state.promotionsLagCeiling = 0;
  state.speakerPendingBlocks = 0;
  if (active) {
    push({ kind: "ws_frame", segmentId: null, note: "session_start" });
  }
}

export function traceTrialHetznerWsFrame(args: {
  segmentId: string | null;
  newFinalCount: number;
  nfRawLen: number;
  tokenCount: number;
}): void {
  state.lastWsPerfMs = perfNow();
  push({
    kind: "ws_frame",
    segmentId: args.segmentId,
    note: `tokens=${args.tokenCount} newFinals=${args.newFinalCount} nfRawLen=${args.nfRawLen}`,
  });
}

export function traceTrialHetznerFinalToken(args: {
  segmentId: string | null;
  text: string;
  speakerId?: string;
  blockedReason?: string;
  lockedLenAfter?: number;
}): void {
  if (args.blockedReason) state.speakerPendingBlocks += 1;
  push({
    kind: "final_token",
    segmentId: args.segmentId,
    tokenText: clip(args.text),
    isFinal: true,
    speakerId: args.speakerId,
    lockedLen: args.lockedLenAfter,
    blockedReason: args.blockedReason,
  });
}

export function traceTrialHetznerSpeakerPending(args: {
  segmentId: string | null;
  pendingSpeakerId: string;
  streak: number;
  bufferedLen: number;
}): void {
  push({
    kind: "speaker_pending",
    segmentId: args.segmentId,
    speakerId: args.pendingSpeakerId,
    pendingSpeakerStreak: args.streak,
    pendingBufferedLen: args.bufferedLen,
    blockedReason: "speaker_stabilization",
  });
}

export function traceTrialHetznerSpeakerConfirmed(args: {
  segmentId: string | null;
  speakerId: string;
  flushedBufferedLen: number;
}): void {
  push({
    kind: "speaker_confirmed",
    segmentId: args.segmentId,
    speakerId: args.speakerId,
    pendingBufferedLen: args.flushedBufferedLen,
    note: "buffered finals flushed to new segment",
  });
}

export function traceTrialHetznerCommittedPaint(args: {
  segmentId: string | null;
  lockedLen: number;
  visibleBoundary: number;
  domCommittedLen: number;
  promoteReason: MorsyCanonPromotionKind;
  idleNeedMs: number;
  msQuietSinceGrowth: number;
  msBacklogLag: number | null;
  newFinalUtf16ThisMsg: number;
}): void {
  const stagingGap = args.lockedLen - args.visibleBoundary;
  const prevDom = state.lastCommittedDomLen;
  const domDelta = args.domCommittedLen - prevDom;
  const wsToDomMs =
    state.lastWsPerfMs > 0 ? Math.round(perfNow() - state.lastWsPerfMs) : null;

  if (domDelta > 24 || (args.promoteReason !== "none" && stagingGap === 0 && domDelta > 0)) {
    state.chunkEvents += 1;
  }
  if (args.promoteReason === "idle_quiet") state.promotionsIdleQuiet += 1;
  if (args.promoteReason === "lag_ceiling") state.promotionsLagCeiling += 1;

  state.lastCommittedDomLen = args.domCommittedLen;

  push({
    kind: "committed_paint",
    segmentId: args.segmentId,
    lockedLen: args.lockedLen,
    visibleBoundary: args.visibleBoundary,
    stagingGap,
    domCommittedLen: args.domCommittedLen,
    promoteReason: args.promoteReason,
    idleNeedMs: args.idleNeedMs,
    msQuietSinceGrowth: args.msQuietSinceGrowth,
    msBacklogLag: args.msBacklogLag,
    note:
      `domDelta=${domDelta} wsToDomMs=${wsToDomMs ?? "na"} newFinalUtf16=${args.newFinalUtf16ThisMsg} reason=${args.promoteReason}`,
  });
}

export function traceTrialHetznerNfPaint(args: {
  segmentId: string | null;
  nfRawLen: number;
  domNfLen: number;
  speakerTailChanged: boolean;
}): void {
  push({
    kind: "nf_paint",
    segmentId: args.segmentId,
    domNfLen: args.domNfLen,
    note: `nfRawLen=${args.nfRawLen} tailSpeakerChanged=${args.speakerTailChanged}`,
  });
}

export function traceTrialHetznerSegmentClose(args: {
  segmentId: string | null;
  reason: string;
}): void {
  state.lastCommittedDomLen = 0;
  push({
    kind: "segment_close",
    segmentId: args.segmentId,
    note: args.reason,
  });
}

export function traceTrialHetznerTranslationSchedule(args: {
  segmentId: string | null;
  sourceLen: number;
  isFinal: boolean;
  debounceMs: number;
}): void {
  push({
    kind: "translation_schedule",
    segmentId: args.segmentId,
    note: `sourceLen=${args.sourceLen} final=${args.isFinal} debounceMs=${args.debounceMs}`,
    blockedReason: "translation_debounce_only_affects_translation_column",
  });
}

export type TrialHetznerStreamSummary = {
  rowCount: number;
  chunkEvents: number;
  promotionsIdleQuiet: number;
  promotionsLagCeiling: number;
  speakerPendingBlocks: number;
  avgStagingGapAtPaint: number;
  maxStagingGapAtPaint: number;
  interpretation: string[];
};

function buildSummary(): TrialHetznerStreamSummary {
  const paints = state.rows.filter((r) => r.kind === "committed_paint");
  const gaps = paints.map((r) => r.stagingGap ?? 0);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const maxGap = gaps.length ? Math.max(...gaps) : 0;

  const interpretation: string[] = [
    "Within-bubble streaming uses immediate append (canonImmediateCommittedAppend); visibleCommittedBoundary lag is bypassed for trial-hetzner.",
    "Speaker transitions buffer finals until FAST_SWITCH confirms (2 WS messages or 300ms), producing burst writes on new rows.",
    "Fast back-and-forth may abandon pending buffer onto the OLD row (pending_speaker_flush path).",
    "Translation debounce (52ms) affects Arabic column only; it does not gate English committed streaming.",
  ];

  return {
    rowCount: state.rows.length,
    chunkEvents: state.chunkEvents,
    promotionsIdleQuiet: state.promotionsIdleQuiet,
    promotionsLagCeiling: state.promotionsLagCeiling,
    speakerPendingBlocks: state.speakerPendingBlocks,
    avgStagingGapAtPaint: Math.round(avgGap),
    maxStagingGapAtPaint: maxGap,
    interpretation,
  };
}

function attachWindowApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w[RING_KEY] = {
    getRows: () => [...state.rows],
    printSummary: () => {
      // eslint-disable-next-line no-console
      console.info("[trial_hetzner_stream_summary]", buildSummary());
    },
    exportRows: () => JSON.stringify({ summary: buildSummary(), rows: state.rows }, null, 2),
  };
}
