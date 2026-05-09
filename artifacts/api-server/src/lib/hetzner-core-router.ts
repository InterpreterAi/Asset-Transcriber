import { logger } from "./logger.js";

/** Libre worker slot: lane **1** = CORE1 (:5001), lane **2** = CORE2 (:5002). */
export type CoreLane = 1 | 2;
export type CoreRoute = { lane: CoreLane; baseUrl: string };

/** Emergency: every lane uses the same single LibreTranslate (`:5000`). */
const USE_LEGACY_EMERGENCY = process.env.HETZNER_USE_LEGACY_SINGLE_STACK === "1";

const LEGACY_TRANSLATE_BASE = (process.env.HETZNER_TRANSLATE_LEGACY_BASE ?? "http://178.156.211.226:5000").trim();

function defaultLaneBases(): Record<CoreLane, string> {
  const raw = (process.env.HETZNER_WORKER_HOST ?? "178.156.211.226").trim();
  const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const scheme = (process.env.HETZNER_WORKER_SCHEME ?? "http").trim().replace(/:+$/, "");
  const root = `${scheme}://${host}`;
  return { 1: `${root}:5001`, 2: `${root}:5002` };
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

const twoLaneIsolation = !USE_LEGACY_EMERGENCY;

const laneToBase: Record<CoreLane, string> = {
  1: CORE1_BASE,
  2: CORE2_BASE,
};

function laneIndex(lane: CoreLane): 0 | 1 {
  return lane === 1 ? 0 : 1;
}

/** Exclusive paid owner per worker slot `0` = lane 1, `1` = lane 2. Null = no paid claim (trials may use). */
const slotPaidOwner: [number | null, number | null] = [null, null];
/** Trial sessions using a slot (including trials sharing a core with paid). */
const slotTrialSessions: [Set<number>, Set<number>] = [new Set(), new Set()];
/** Sticky: sessionId → lane for the lifetime of the session (until expired). */
const sessionToLane = new Map<number, CoreLane>();

export function isPaidMachinePlanType(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return p === "basic-libre" || p === "professional-libre" || p === "platinum-libre";
}

function clearTrialsFromSlot(idx: 0 | 1): void {
  const set = slotTrialSessions[idx];
  for (const sid of set) {
    sessionToLane.delete(sid);
  }
  set.clear();
}

/** First two paid users each claim an empty worker; further paid share CORE1 (overflow). */
function allocatePaid(sessionId: number): CoreRoute {
  for (const i of [0, 1] as const) {
    if (slotPaidOwner[i] === null) {
      clearTrialsFromSlot(i);
      slotPaidOwner[i] = sessionId;
      const lane = (i + 1) as CoreLane;
      sessionToLane.set(sessionId, lane);
      logger.info(
        { sessionId, lane, core: `CORE${i + 1}`, exclusive: true },
        "Hetzner core router: paid claimed exclusive worker",
      );
      return { lane, baseUrl: laneToBase[lane] };
    }
  }
  const lane: CoreLane = 1;
  sessionToLane.set(sessionId, lane);
  logger.info(
    { sessionId, lane: 1, exclusive: false },
    "Hetzner core router: paid overflow shares CORE1 (both workers have exclusive paid)",
  );
  return { lane, baseUrl: laneToBase[lane] };
}

/** Trials prefer workers with no exclusive paid; may share CORE2 if both workers are paid-claimed. */
function allocateTrial(sessionId: number): CoreRoute {
  for (const i of [0, 1] as const) {
    if (slotPaidOwner[i] === null) {
      slotTrialSessions[i].add(sessionId);
      const lane = (i + 1) as CoreLane;
      sessionToLane.set(sessionId, lane);
      logger.info({ sessionId, lane }, "Hetzner core router: trial on idle worker");
      return { lane, baseUrl: laneToBase[lane] };
    }
  }
  const lane: CoreLane = 2;
  slotTrialSessions[1].add(sessionId);
  sessionToLane.set(sessionId, lane);
  logger.info({ sessionId, lane: 2 }, "Hetzner core router: trial shares CORE2 (both workers exclusive paid)");
  return { lane, baseUrl: laneToBase[lane] };
}

function stickyStillValid(sessionId: number, paid: boolean, sticky: CoreLane): boolean {
  const idx = laneIndex(sticky);
  if (paid) {
    if (slotPaidOwner[idx] === sessionId) return true;
    if (sticky === 1 && slotPaidOwner[0] !== null && slotPaidOwner[0] !== sessionId) return true;
    return false;
  }
  return slotTrialSessions[idx].has(sessionId);
}

function invalidateSticky(sessionId: number): void {
  sessionToLane.delete(sessionId);
  slotTrialSessions[0].delete(sessionId);
  slotTrialSessions[1].delete(sessionId);
}

/**
 * @param machineTranslationEnabled When false, the session does not use Hetzner;
 *   release any reservation (legacy hook — same as unregister).
 */
export function registerSessionStartForCoreRouting(
  sessionId: number,
  planType: string,
  machineTranslationEnabled = true,
): void {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return;
  if (!machineTranslationEnabled) {
    unregisterSessionForCoreRouting(sessionId);
    return;
  }
  void selectHetznerCoreRoute(planType, sessionId);
}

/** Call when a session ends (stop, stale sweep, startup cleanup) so workers can be reclaimed. */
export function unregisterSessionForCoreRouting(sessionId: number): void {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return;
  sessionToLane.delete(sessionId);
  for (const i of [0, 1] as const) {
    if (slotPaidOwner[i] === sessionId) {
      slotPaidOwner[i] = null;
    }
    slotTrialSessions[i].delete(sessionId);
  }
}

export function selectHetznerCoreRoute(planType: string, sessionId?: number): CoreRoute {
  if (USE_LEGACY_EMERGENCY) {
    return { lane: 1, baseUrl: laneToBase[1] };
  }

  const paid = isPaidMachinePlanType(planType);
  const sid =
    typeof sessionId === "number" && Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null;

  if (sid != null) {
    const sticky = sessionToLane.get(sid);
    if (sticky != null) {
      if (stickyStillValid(sid, paid, sticky)) {
        return { lane: sticky, baseUrl: laneToBase[sticky] };
      }
      invalidateSticky(sid);
    }
    return paid ? allocatePaid(sid) : allocateTrial(sid);
  }

  if (paid) {
    return { lane: 1, baseUrl: laneToBase[1] };
  }
  if (slotPaidOwner[0] === null) {
    return { lane: 1, baseUrl: laneToBase[1] };
  }
  if (slotPaidOwner[1] === null) {
    return { lane: 2, baseUrl: laneToBase[2] };
  }
  return { lane: 2, baseUrl: laneToBase[2] };
}

export function logHetznerCoreRouterStartupHint(): void {
  logger.info(
    {
      lanes: laneToBase,
      twoLaneIsolation,
      legacyEmergency: USE_LEGACY_EMERGENCY,
      legacyFallbackBase: LEGACY_TRANSLATE_BASE,
      semantics:
        "paid claims exclusive CORE1/CORE2 first-come; overflow paid share CORE1; trials prefer idle core; evict trials when paid claims",
    },
    USE_LEGACY_EMERGENCY
      ? "Hetzner core router: LEGACY SINGLE STACK (HETZNER_USE_LEGACY_SINGLE_STACK=1)"
      : "Hetzner core router: two workers — paid priority, trial idle fill — see deploy/MEMORY-BUDGET-2LANE.md",
  );
}
