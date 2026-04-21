import { logger } from "./logger.js";

type CoreLane = 1 | 2 | 3;
type CoreRoute = { lane: CoreLane; baseUrl: string };

const CORE1_BASE = (process.env.HETZNER_CORE1_TRANSLATE_BASE ?? "http://178.156.211.226:5001").trim();
const CORE2_BASE = (process.env.HETZNER_CORE2_TRANSLATE_BASE ?? "http://178.156.211.226:5002").trim();
const CORE3_BASE = (process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "http://178.156.211.226:5003").trim();

const laneToBase: Record<CoreLane, string> = {
  1: CORE1_BASE,
  2: CORE2_BASE,
  3: CORE3_BASE,
};

const sessionLane = new Map<number, CoreLane>();
const paidActiveSessions = new Set<number>();
let trialRoundRobinIdx = 0;

function isPaidPlan(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return p === "basic-libre" || p === "professional-libre" || p === "platinum-libre";
}

function nextTrialLaneNoPaid(): CoreLane {
  const lanes: CoreLane[] = [1, 2, 3];
  const lane = lanes[trialRoundRobinIdx % lanes.length]!;
  trialRoundRobinIdx += 1;
  return lane;
}

function choosePaidLane(): CoreLane {
  let l1 = 0;
  let l2 = 0;
  for (const lane of sessionLane.values()) {
    if (lane === 1) l1 += 1;
    if (lane === 2) l2 += 1;
  }
  return l1 <= l2 ? 1 : 2;
}

function preemptTrialsOffPaidLanes(): void {
  if (paidActiveSessions.size === 0) return;
  for (const [sid, lane] of sessionLane.entries()) {
    if (paidActiveSessions.has(sid)) continue;
    if (lane === 1 || lane === 2) {
      sessionLane.set(sid, 3);
    }
  }
}

export function registerSessionStartForCoreRouting(sessionId: number, planType: string): void {
  if (!Number.isFinite(sessionId)) return;
  if (isPaidPlan(planType)) {
    paidActiveSessions.add(sessionId);
    sessionLane.set(sessionId, choosePaidLane());
    // Instant pre-emption: new paid session pushes trial workloads to lane 3.
    preemptTrialsOffPaidLanes();
    return;
  }
  if (paidActiveSessions.size > 0) {
    sessionLane.set(sessionId, 3);
    return;
  }
  sessionLane.set(sessionId, nextTrialLaneNoPaid());
}

export function unregisterSessionForCoreRouting(sessionId: number): void {
  sessionLane.delete(sessionId);
  paidActiveSessions.delete(sessionId);
}

export function selectHetznerCoreRoute(planType: string, sessionId?: number): CoreRoute {
  if (typeof sessionId === "number" && Number.isFinite(sessionId)) {
    const assigned = sessionLane.get(sessionId);
    if (assigned) {
      return { lane: assigned, baseUrl: laneToBase[assigned] };
    }
    // If a paid session starts and no assignment exists yet, create one now.
    registerSessionStartForCoreRouting(sessionId, planType);
    const fresh = sessionLane.get(sessionId);
    if (fresh) {
      return { lane: fresh, baseUrl: laneToBase[fresh] };
    }
  }

  if (isPaidPlan(planType)) {
    const lane = choosePaidLane();
    return { lane, baseUrl: laneToBase[lane] };
  }
  if (paidActiveSessions.size > 0) {
    return { lane: 3, baseUrl: laneToBase[3] };
  }
  const lane = nextTrialLaneNoPaid();
  return { lane, baseUrl: laneToBase[lane] };
}

export function logHetznerCoreRouterStartupHint(): void {
  logger.info(
    {
      lanes: laneToBase,
      semantics: "paid lock cores 1/2, trial borrow all cores only when no paid active, preempt trial->core3 on paid start",
    },
    "Hetzner core router configured",
  );
}

