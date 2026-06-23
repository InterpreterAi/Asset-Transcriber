/**
 * Trial-hetzner — DOM text snapshots at speaker transitions (visible spans only).
 *
 * Enable before Start (full reload):
 *   localStorage.setItem("interpreterai_trial_hetzner_dom_audit", "1")
 *
 * After Stop:
 *   window.__trialHetznerDomAudit.printAll()
 *   copy(JSON.stringify(window.__trialHetznerDomAudit.getSnapshots(), null, 2))
 */

const LS_KEY = "interpreterai_trial_hetzner_dom_audit";
const API_KEY = "__trialHetznerDomAudit";

export type DomTransitionMoment =
  | "first_new_speaker_nonfinal"
  | "first_new_speaker_final"
  | "provisional_open"
  | "provisional_first_paint"
  | "speaker_confirm"
  | "provisional_rollback";

export type DomTransitionSnapshot = {
  moment: DomTransitionMoment;
  timestamp: number;
  sinceSessionMs: number;
  transitionId: number;
  speakerId: string | null;
  oldRowCommitted: string;
  oldRowNF: string;
  newRowCommitted: string;
  newRowNF: string;
};

let planGate: () => boolean = () => false;
let sessionStartPerfMs = 0;
let transitionSeq = 0;
let activeTransitionId = 0;
let activeSpeakerId: string | null = null;
const loggedMoments = new Set<string>();
const snapshots: DomTransitionSnapshot[] = [];

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function spanText(span: HTMLSpanElement | null | undefined): string {
  return span?.textContent ?? "";
}

function emit(snap: DomTransitionSnapshot): void {
  // eslint-disable-next-line no-console
  console.info("[dom_transition_audit]", snap);
}

export function registerTrialHetznerDomAuditPlanGate(gate: () => boolean): void {
  planGate = gate;
  attachApi();
}

export function resetTrialHetznerDomAuditSession(): void {
  sessionStartPerfMs = perfNow();
  transitionSeq = 0;
  activeTransitionId = 0;
  activeSpeakerId = null;
  loggedMoments.clear();
  snapshots.length = 0;
}

export function trialHetznerDomAuditEnabled(): boolean {
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

/** New pending speaker — starts a DOM audit sequence for this transition. */
export function domAuditBeginSpeakerTransition(speakerId: string): void {
  if (!trialHetznerDomAuditEnabled()) return;
  transitionSeq += 1;
  activeTransitionId = transitionSeq;
  activeSpeakerId = speakerId;
}

function momentKey(moment: DomTransitionMoment): string {
  return `${activeTransitionId}:${moment}`;
}

/**
 * Snapshot visible committed + NF span text for old and new rows.
 * Pass explicit span refs — reads textContent only.
 */
export function domAuditSnapshot(args: {
  moment: DomTransitionMoment;
  speakerId?: string | null;
  oldCommitted: HTMLSpanElement | null | undefined;
  oldNF: HTMLSpanElement | null | undefined;
  newCommitted: HTMLSpanElement | null | undefined;
  newNF: HTMLSpanElement | null | undefined;
}): void {
  if (!trialHetznerDomAuditEnabled()) return;
  const key = momentKey(args.moment);
  if (loggedMoments.has(key)) return;
  loggedMoments.add(key);

  const now = perfNow();
  const snap: DomTransitionSnapshot = {
    moment: args.moment,
    timestamp: now,
    sinceSessionMs: Math.round(now - sessionStartPerfMs),
    transitionId: activeTransitionId,
    speakerId: args.speakerId ?? activeSpeakerId,
    oldRowCommitted: spanText(args.oldCommitted),
    oldRowNF: spanText(args.oldNF),
    newRowCommitted: spanText(args.newCommitted),
    newRowNF: spanText(args.newNF),
  };
  snapshots.push(snap);
  emit(snap);
}

export function domAuditEndTransition(): void {
  activeTransitionId = 0;
  activeSpeakerId = null;
}

function attachApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w[API_KEY] = {
    enabled: () => trialHetznerDomAuditEnabled(),
    flag: LS_KEY,
    getSnapshots: () => [...snapshots],
    printAll: () => {
      for (const s of snapshots) emit(s);
      // eslint-disable-next-line no-console
      console.info("[dom_transition_audit_summary]", {
        count: snapshots.length,
        transitions: [...new Set(snapshots.map((x) => x.transitionId))].length,
      });
    },
    clear: () => {
      snapshots.length = 0;
      loggedMoments.clear();
    },
  };
}
