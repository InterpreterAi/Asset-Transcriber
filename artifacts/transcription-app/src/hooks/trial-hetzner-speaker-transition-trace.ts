/**
 * Trial-hetzner ONLY — speaker-transition timing (diagnosis, no behavior change).
 *
 * Enable before Start (full reload):
 *   localStorage.setItem("interpreterai_trial_hetzner_speaker_trace", "1")
 *
 * After Stop:
 *   window.__trialHetznerSpeakerTrace.printAll()
 *   copy(JSON.stringify(window.__trialHetznerSpeakerTrace.getSwitches(), null, 2))
 */

const LS_KEY = "interpreterai_trial_hetzner_speaker_trace";
const API_KEY = "__trialHetznerSpeakerTrace";

export type SpeakerSwitchRecord = {
  switchId: number;
  pendingSpeakerId: string;
  previousSpeakerId: string | null;
  oldSegmentId: string | null;
  newSegmentId: string | null;
  /** perf.now() ms */
  speaker_change_detected: number | null;
  stabilization_begin: number | null;
  first_token_time: number | null;
  first_final_time: number | null;
  speaker_confirm_time: number | null;
  new_row_created_time: number | null;
  first_visible_paint_time: number | null;
  stabilization_end: number | null;
  buffered_chars: number;
  buffered_tokens: number;
  confirm_reason: "streak" | "age" | "abandoned_flush_old_row" | "immediate_no_gate" | null;
  abandoned: boolean;
  notes: string[];
};

type ActiveSwitch = SpeakerSwitchRecord & { open: boolean };

let planGate: () => boolean = () => false;
let active = false;
let sessionStartPerfMs = 0;
let switchSeq = 0;
let current: ActiveSwitch | null = null;
const completed: SpeakerSwitchRecord[] = [];

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function sinceSession(ms: number | null): number | null {
  if (ms === null) return null;
  return Math.round(ms - sessionStartPerfMs);
}

function clip(s: string, max = 40): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function emitLine(rec: SpeakerSwitchRecord, tag = "speaker_switch"): void {
  const line = {
    tag,
    switchId: rec.switchId,
    pendingSpeakerId: rec.pendingSpeakerId,
    previousSpeakerId: rec.previousSpeakerId,
    oldSegmentId: rec.oldSegmentId,
    newSegmentId: rec.newSegmentId,
    speaker_change_detected: sinceSession(rec.speaker_change_detected),
    first_token_time: sinceSession(rec.first_token_time),
    first_final_time: sinceSession(rec.first_final_time),
    speaker_confirm_time: sinceSession(rec.speaker_confirm_time),
    new_row_created_time: sinceSession(rec.new_row_created_time),
    first_visible_paint_time: sinceSession(rec.first_visible_paint_time),
    stabilization_begin: sinceSession(rec.stabilization_begin),
    stabilization_end: sinceSession(rec.stabilization_end),
    buffering_duration_ms:
      rec.stabilization_begin !== null && rec.first_visible_paint_time !== null
        ? Math.round(rec.first_visible_paint_time - rec.stabilization_begin)
        : rec.stabilization_begin !== null && rec.speaker_confirm_time !== null
          ? Math.round(rec.speaker_confirm_time - rec.stabilization_begin)
          : null,
    ms_to_first_visible:
      rec.first_token_time !== null && rec.first_visible_paint_time !== null
        ? Math.round(rec.first_visible_paint_time - rec.first_token_time)
        : null,
    buffered_chars: rec.buffered_chars,
    buffered_tokens: rec.buffered_tokens,
    confirm_reason: rec.confirm_reason,
    abandoned: rec.abandoned,
    notes: rec.notes,
  };
  // eslint-disable-next-line no-console
  console.info(`[${tag}]`, line);
}

function closeCurrent(reason: string): void {
  if (!current || !active || !planGate()) return;
  current.open = false;
  if (current.stabilization_end === null) {
    current.stabilization_end = perfNow();
  }
  current.notes.push(reason);
  const snap: SpeakerSwitchRecord = { ...current };
  delete (snap as { open?: boolean }).open;
  completed.push(snap);
  emitLine(snap, "speaker_switch_complete");
  current = null;
}

export function trialHetznerSpeakerTraceEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function registerTrialHetznerSpeakerTracePlanGate(gate: () => boolean): void {
  planGate = gate;
  attachApi();
}

export function resetTrialHetznerSpeakerTraceSession(): void {
  active = trialHetznerSpeakerTraceEnabled();
  sessionStartPerfMs = perfNow();
  switchSeq = 0;
  current = null;
  completed.length = 0;
  if (active) {
    // eslint-disable-next-line no-console
    console.info("[speaker_switch]", { tag: "session_start", sinceSessionMs: 0 });
  }
}

/** New speaker detected — stabilization window opens; no new row yet. */
export function traceSpeakerChangeDetected(args: {
  pendingSpeakerId: string;
  previousSpeakerId: string | undefined;
  oldSegmentId: string | null;
  streak: number;
}): void {
  if (!active || !planGate()) return;
  const now = perfNow();
  if (current?.open && current.pendingSpeakerId === args.pendingSpeakerId) {
    current.notes.push(`streak=${args.streak}`);
    return;
  }
  if (current?.open) closeCurrent("superseded_by_new_pending_speaker");
  switchSeq += 1;
  current = {
    switchId: switchSeq,
    pendingSpeakerId: args.pendingSpeakerId,
    previousSpeakerId: args.previousSpeakerId ?? null,
    oldSegmentId: args.oldSegmentId,
    newSegmentId: null,
    speaker_change_detected: now,
    stabilization_begin: now,
    first_token_time: null,
    first_final_time: null,
    speaker_confirm_time: null,
    new_row_created_time: null,
    first_visible_paint_time: null,
    stabilization_end: null,
    buffered_chars: 0,
    buffered_tokens: 0,
    confirm_reason: null,
    abandoned: false,
    notes: [`streak=${args.streak}`],
    open: true,
  };
  emitLine(current, "speaker_change_detected");
}

/** Token from pending speaker while handledByPendingSwitchLogic — may be NF or final. */
export function traceSpeakerPendingToken(args: {
  text: string;
  isFinal: boolean;
  blockedOnOldRow: boolean;
}): void {
  if (!active || !planGate() || !current?.open) return;
  const now = perfNow();
  if (current.first_token_time === null) current.first_token_time = now;
  if (args.isFinal) {
    if (current.first_final_time === null) current.first_final_time = now;
    current.buffered_tokens += 1;
    current.buffered_chars += args.text.length;
    current.notes.push(`final_buffered:${clip(args.text)}`);
  } else {
    current.notes.push(`nf_or_nonfinal_seen:${clip(args.text)}`);
  }
}

/** Speaker FAST_SWITCH confirm fired — about to close old row and create new. */
export function traceSpeakerConfirm(args: {
  reason: "streak" | "age";
  streak: number;
  ageMs: number;
  bufferedChars: number;
  bufferedTokens: number;
}): void {
  if (!active || !planGate() || !current?.open) return;
  const now = perfNow();
  current.speaker_confirm_time = now;
  current.stabilization_end = now;
  current.confirm_reason = args.reason;
  current.buffered_chars = args.bufferedChars;
  current.buffered_tokens = args.bufferedTokens;
  current.notes.push(`confirm reason=${args.reason} streak=${args.streak} ageMs=${args.ageMs}`);
  emitLine(current, "speaker_confirm");
}

/** createBubble called after confirm for pending speaker. */
export function traceSpeakerNewRowCreated(args: {
  pendingSpeakerId: string;
  newSegmentId: string;
}): void {
  if (!active || !planGate() || !current?.open) return;
  const now = perfNow();
  current.newSegmentId = args.newSegmentId;
  current.new_row_created_time = now;
  current.notes.push(`new_row segment=${args.newSegmentId}`);
  emitLine(current, "new_row_created");
}

/** First committed paint on new segment after buffered flush. */
export function traceSpeakerFirstVisiblePaint(args: {
  segmentId: string;
  domCommittedLen: number;
  lockedLen: number;
  flushedBufferedChars: number;
}): void {
  if (!active || !planGate() || !current?.open) return;
  if (current.newSegmentId && current.newSegmentId !== args.segmentId) return;
  if (current.first_visible_paint_time !== null) return;
  const now = perfNow();
  current.first_visible_paint_time = now;
  current.notes.push(
    `first_paint domLen=${args.domCommittedLen} locked=${args.lockedLen} flush=${current.buffered_chars}`,
  );
  emitLine(current, "first_visible_paint");
  closeCurrent("paint_complete");
}

/** Pending abandoned — buffer flushed to OLD row (fast back-and-forth path). */
export function traceSpeakerPendingAbandonedFlushOldRow(args: {
  pendingSpeakerId: string;
  oldSegmentId: string | null;
  flushedChars: number;
  reason: string;
}): void {
  if (!active || !planGate()) return;
  if (!current?.open) return;
  const now = perfNow();
  current.abandoned = true;
  current.confirm_reason = "abandoned_flush_old_row";
  current.speaker_confirm_time = now;
  current.stabilization_end = now;
  current.buffered_chars = args.flushedChars;
  current.notes.push(`abandoned:${args.reason} flush_to_old=${args.oldSegmentId}`);
  emitLine(current, "speaker_pending_abandoned");
  closeCurrent("abandoned_flush_old_row");
}

/** No speaker gate path (should not happen on trial-hetzner isolated experiment). */
export function traceSpeakerImmediateRow(args: {
  speakerId: string;
  segmentId: string;
}): void {
  if (!active || !planGate()) return;
  const now = perfNow();
  switchSeq += 1;
  const rec: SpeakerSwitchRecord = {
    switchId: switchSeq,
    pendingSpeakerId: args.speakerId,
    previousSpeakerId: null,
    oldSegmentId: null,
    newSegmentId: args.segmentId,
    speaker_change_detected: now,
    stabilization_begin: null,
    first_token_time: now,
    first_final_time: now,
    speaker_confirm_time: now,
    new_row_created_time: now,
    first_visible_paint_time: null,
    stabilization_end: now,
    buffered_chars: 0,
    buffered_tokens: 0,
    confirm_reason: "immediate_no_gate",
    abandoned: false,
    notes: ["no pendingSpeakerSwitchRef gate"],
  };
  completed.push(rec);
  emitLine(rec, "speaker_immediate_row");
}

function attachApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w[API_KEY] = {
    getSwitches: () => [...completed, ...(current ? [{ ...current, open: undefined }] : [])],
    printAll: () => {
      for (const rec of completed) emitLine(rec, "speaker_switch_summary");
      if (current) emitLine(current, "speaker_switch_summary_in_progress");
      // eslint-disable-next-line no-console
      console.info("[speaker_switch_stats]", buildStats());
    },
    buildStats,
  };
}

function buildStats(): {
  count: number;
  avgBufferingMs: number | null;
  avgMsToFirstVisible: number | null;
  avgBufferedChars: number | null;
  avgBufferedTokens: number | null;
  abandonedCount: number;
} {
  const rows = completed.filter((r) => r.stabilization_begin !== null);
  const bufMs = rows
    .map((r) =>
      r.first_visible_paint_time !== null && r.stabilization_begin !== null
        ? r.first_visible_paint_time - r.stabilization_begin
        : r.speaker_confirm_time !== null && r.stabilization_begin !== null
          ? r.speaker_confirm_time - r.stabilization_begin
          : null,
    )
    .filter((x): x is number => x !== null);
  const toVis = rows
    .map((r) =>
      r.first_token_time !== null && r.first_visible_paint_time !== null
        ? r.first_visible_paint_time - r.first_token_time
        : null,
    )
    .filter((x): x is number => x !== null);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return {
    count: completed.length,
    avgBufferingMs: avg(bufMs),
    avgMsToFirstVisible: avg(toVis),
    avgBufferedChars: avg(rows.map((r) => r.buffered_chars)),
    avgBufferedTokens: avg(rows.map((r) => r.buffered_tokens)),
    abandonedCount: completed.filter((r) => r.abandoned).length,
  };
}
