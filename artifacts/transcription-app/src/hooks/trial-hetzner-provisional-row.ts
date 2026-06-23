/**
 * Trial-hetzner ONLY — provisional speaker row experiment (originals column).
 *
 * Enable before Start (full reload):
 *   localStorage.setItem("interpreterai_trial_hetzner_provisional_row", "1")
 *
 * Trace events: provisional_open, provisional_first_paint, provisional_confirm, provisional_rollback
 */

const LS_KEY = "interpreterai_trial_hetzner_provisional_row";
const API_KEY = "__trialHetznerProvisionalRow";

export type PendingSpeakerSwitchProvisional = {
  sid: string;
  messageStreak: number;
  firstMs: number;
  bufferedFinalText: string;
  provisionalOpened?: boolean;
  previousBubbleRef?: HTMLSpanElement | null;
  previousBubbleStateRef?: { segmentId: string; lockedCommittedFinalOriginal: string } | null;
  previousNfRef?: HTMLSpanElement | null;
  previousRowEl?: HTMLDivElement | null;
  provisionalLockedAtOpen?: number;
  provisionalSegmentId?: string | null;
  provisionalFirstPaintEmitted?: boolean;
};

let planGate: () => boolean = () => false;
let sessionStartPerfMs = 0;

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function sinceSession(ms: number | null): number | null {
  if (ms === null) return null;
  return Math.round(ms - sessionStartPerfMs);
}

function emit(tag: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.info(`[${tag}]`, payload);
}

export function registerTrialHetznerProvisionalRowPlanGate(gate: () => boolean): void {
  planGate = gate;
  attachApi();
}

export function resetTrialHetznerProvisionalRowSession(): void {
  sessionStartPerfMs = perfNow();
}

export function trialHetznerProvisionalRowExperimentEnabled(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(LS_KEY) === "1" &&
      planGate()
    );
  } catch {
    return false;
  }
}

export function isProvisionalSpeakerRowPending(
  pending: PendingSpeakerSwitchProvisional | null,
  activeSegmentId: string | null | undefined,
): boolean {
  return !!(
    trialHetznerProvisionalRowExperimentEnabled() &&
    pending?.provisionalOpened &&
    activeSegmentId &&
    pending.provisionalSegmentId === activeSegmentId
  );
}

export function traceProvisionalOpen(args: {
  pendingSpeakerId: string;
  previousSpeakerId: string | null;
  previousSegmentId: string | null;
  provisionalSegmentId: string | null;
}): void {
  if (!trialHetznerProvisionalRowExperimentEnabled()) return;
  const now = perfNow();
  emit("provisional_open", {
    sinceSessionMs: sinceSession(now),
    pendingSpeakerId: args.pendingSpeakerId,
    previousSpeakerId: args.previousSpeakerId,
    previousSegmentId: args.previousSegmentId,
    provisionalSegmentId: args.provisionalSegmentId,
  });
}

export function traceProvisionalFirstPaint(args: {
  provisionalSegmentId: string;
  domCommittedLen: number;
  lockedLen: number;
}): void {
  if (!trialHetznerProvisionalRowExperimentEnabled()) return;
  const now = perfNow();
  emit("provisional_first_paint", {
    sinceSessionMs: sinceSession(now),
    provisionalSegmentId: args.provisionalSegmentId,
    domCommittedLen: args.domCommittedLen,
    lockedLen: args.lockedLen,
  });
}

export function traceProvisionalConfirm(args: {
  provisionalSegmentId: string | null;
  previousSegmentId: string | null;
  reason: "streak" | "age";
}): void {
  if (!trialHetznerProvisionalRowExperimentEnabled()) return;
  const now = perfNow();
  emit("provisional_confirm", {
    sinceSessionMs: sinceSession(now),
    provisionalSegmentId: args.provisionalSegmentId,
    previousSegmentId: args.previousSegmentId,
    reason: args.reason,
  });
}

export function traceProvisionalRollback(args: {
  provisionalSegmentId: string | null;
  previousSegmentId: string | null;
  mergedChars: number;
  reason: string;
}): void {
  if (!trialHetznerProvisionalRowExperimentEnabled()) return;
  const now = perfNow();
  emit("provisional_rollback", {
    sinceSessionMs: sinceSession(now),
    provisionalSegmentId: args.provisionalSegmentId,
    previousSegmentId: args.previousSegmentId,
    mergedChars: args.mergedChars,
    reason: args.reason,
  });
}

function attachApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w[API_KEY] = {
    enabled: () => trialHetznerProvisionalRowExperimentEnabled(),
    flag: LS_KEY,
  };
}
