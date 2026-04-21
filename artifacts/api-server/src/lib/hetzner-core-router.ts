import { logger } from "./logger.js";

type CoreLane = 1 | 2 | 3;
type CoreRoute = { lane: CoreLane; baseUrl: string };

/** Emergency only: all lanes → one LibreTranslate (e.g. workers down). Normal operation keeps three URLs. */
const USE_LEGACY_EMERGENCY = process.env.HETZNER_USE_LEGACY_SINGLE_STACK === "1";

/** Single port when `HETZNER_USE_LEGACY_SINGLE_STACK=1` (default matches `hetzner-translate` primary). */
const LEGACY_TRANSLATE_BASE = (process.env.HETZNER_TRANSLATE_LEGACY_BASE ?? "http://178.156.211.226:5000").trim();

/** Hostname or host for default `http://HOST:5001` … `:5003` (no scheme). Override if workers moved. */
function defaultLaneBases(): Record<CoreLane, string> {
  const raw = (process.env.HETZNER_WORKER_HOST ?? "178.156.211.226").trim();
  const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const scheme = (process.env.HETZNER_WORKER_SCHEME ?? "http").trim().replace(/:+$/, "");
  const root = `${scheme}://${host}`;
  return { 1: `${root}:5001`, 2: `${root}:5002`, 3: `${root}:5003` };
}

const def = defaultLaneBases();
function envOrLane(envVal: string | undefined, lane: CoreLane): string {
  const t = envVal?.trim();
  return t || def[lane];
}
const CORE1_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE1_TRANSLATE_BASE, 1)
).trim();
const CORE2_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE2_TRANSLATE_BASE, 2)
).trim();
const CORE3_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE3_TRANSLATE_BASE, 3)
).trim();

/** False only when forced to legacy single stack; otherwise three distinct lane bases (paid 1/2, trial 3 under load). */
const threeLaneIsolation = !USE_LEGACY_EMERGENCY;

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

/**
 * @param machineTranslationEnabled When false, the session does not use Hetzner (e.g. trial OpenAI phase);
 *   it must not occupy paid/trial core slots.
 */
export function registerSessionStartForCoreRouting(
  sessionId: number,
  planType: string,
  machineTranslationEnabled = true,
): void {
  if (!Number.isFinite(sessionId)) return;
  if (!machineTranslationEnabled) {
    unregisterSessionForCoreRouting(sessionId);
    return;
  }
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
      threeLaneIsolation,
      legacyEmergency: USE_LEGACY_EMERGENCY,
      legacyFallbackBase: LEGACY_TRANSLATE_BASE,
      semantics:
        "paid lock cores 1/2; trials register only when using machine translate; trial borrow 1–3 when no paid active; preempt trial->core3 on paid start",
    },
    USE_LEGACY_EMERGENCY
      ? "Hetzner core router: LEGACY SINGLE STACK (HETZNER_USE_LEGACY_SINGLE_STACK=1) — unset for 3-lane isolation"
      : "Hetzner core router configured (three lane bases; paid prefers 1/2, trials to 3 when paid active)",
  );
}

