import { logger } from "./logger.js";

/** Libre worker lane → CORE1..CORE4 (typically :5001/:5002 per Hetzner host). */
export type CoreLane = 1 | 2 | 3 | 4;
export type CoreRoute = { lane: CoreLane; baseUrl: string };

/** Emergency: every lane uses the same single LibreTranslate (`:5000`). */
const USE_LEGACY_EMERGENCY = process.env.HETZNER_USE_LEGACY_SINGLE_STACK === "1";

const LEGACY_TRANSLATE_BASE = (process.env.HETZNER_TRANSLATE_LEGACY_BASE ?? "http://178.156.211.226:5000").trim();

function defaultLaneBases(): Record<1 | 2, string> {
  const raw = (process.env.HETZNER_WORKER_HOST ?? "178.156.211.226").trim();
  const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const scheme = (process.env.HETZNER_WORKER_SCHEME ?? "http").trim().replace(/:+$/, "");
  const root = `${scheme}://${host}`;
  return { 1: `${root}:5001`, 2: `${root}:5002` };
}

const def = defaultLaneBases();
function envOrLane(envVal: string | undefined, lane: 1 | 2): string {
  const t = envVal?.trim();
  return t || def[lane];
}

const CORE1_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE1_TRANSLATE_BASE, 1)
).trim();
const CORE2_BASE = (
  USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : envOrLane(process.env.HETZNER_CORE2_TRANSLATE_BASE, 2)
).trim();
/** Defaults duplicate CORE2 until CORE3/CORE4 env set (2-lane mode ignores these URLs). */
const CORE3_BASE = (USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : process.env.HETZNER_CORE3_TRANSLATE_BASE?.trim() || CORE2_BASE).trim();
const CORE4_BASE = (USE_LEGACY_EMERGENCY ? LEGACY_TRANSLATE_BASE : process.env.HETZNER_CORE4_TRANSLATE_BASE?.trim() || CORE2_BASE).trim();

const laneToBase: Record<CoreLane, string> = {
  1: CORE1_BASE,
  2: CORE2_BASE,
  3: CORE3_BASE,
  4: CORE4_BASE,
};

function readFourLaneRouterEnv(): boolean {
  const v = (process.env.HETZNER_FOUR_LANE_ROUTER ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Rollback: unset `HETZNER_FOUR_LANE_ROUTER` or set to `0` → 2-slot reservation semantics (original).
 * When enabled, requires explicit `HETZNER_CORE3_TRANSLATE_BASE` and `HETZNER_CORE4_TRANSLATE_BASE`.
 */
function computeNumSlots(): 2 | 4 {
  if (USE_LEGACY_EMERGENCY) return 2;
  if (!readFourLaneRouterEnv()) return 2;
  const c3 = (process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "").trim();
  const c4 = (process.env.HETZNER_CORE4_TRANSLATE_BASE ?? "").trim();
  if (!c3 || !c4) {
    logger.warn(
      { hasCore3: Boolean(c3), hasCore4: Boolean(c4) },
      "Hetzner core router: HETZNER_FOUR_LANE_ROUTER set but CORE3/CORE4 bases incomplete — falling back to 2 lanes",
    );
    return 2;
  }
  return 4;
}

const NUM_SLOTS = computeNumSlots();

/**
 * Slot indices for paid exclusive claims (index i → lane i+1).
 * With four lanes, default CORE layout is CORE1/CORE2 on host A and CORE3/CORE4 on host B.
 * Filling 0→1→2→3 concentrates first two paid on host A; instead fill **1, 3, 4, 2** (lanes)
 * so the second paid lands on host B :5001 before host A :5002.
 */
function paidExclusiveSlotIndices(): readonly number[] {
  if (NUM_SLOTS === 4) return [0, 2, 3, 1];
  return [0, 1];
}

function laneIndex(lane: CoreLane): number {
  return lane - 1;
}

/** Exclusive paid owner per worker slot (index 0 = lane 1 …). Length 4; only first NUM_SLOTS used for allocation. */
const slotPaidOwner: [number | null, number | null, number | null, number | null] = [null, null, null, null];
const slotTrialSessions: [Set<number>, Set<number>, Set<number>, Set<number>] = [
  new Set(),
  new Set(),
  new Set(),
  new Set(),
];
/** Sticky: sessionId → lane for the lifetime of the session (until expired). */
const sessionToLane = new Map<number, CoreLane>();

export function isPaidMachinePlanType(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return p === "basic-libre" || p === "professional-libre" || p === "platinum-libre";
}

function clearTrialsFromSlot(idx: number): void {
  const set = slotTrialSessions[idx];
  if (!set) return;
  for (const sid of set) {
    sessionToLane.delete(sid);
  }
  set.clear();
}

/** First NUM_SLOTS paid sessions claim empty workers; further paid share CORE1 (overflow). */
function allocatePaid(sessionId: number): CoreRoute {
  for (const idx of paidExclusiveSlotIndices()) {
    if (slotPaidOwner[idx] === null) {
      clearTrialsFromSlot(idx);
      slotPaidOwner[idx] = sessionId;
      const lane = (idx + 1) as CoreLane;
      sessionToLane.set(sessionId, lane);
      logger.info(
        {
          sessionId,
          lane,
          slotIndex: idx,
          baseUrl: laneToBase[lane],
          exclusive: true,
          numSlots: NUM_SLOTS,
        },
        "Hetzner core router: paid claimed exclusive worker",
      );
      return { lane, baseUrl: laneToBase[lane] };
    }
  }
  const lane: CoreLane = 1;
  sessionToLane.set(sessionId, lane);
  logger.info(
    { sessionId, lane: 1, exclusive: false, numSlots: NUM_SLOTS },
    "Hetzner core router: paid overflow shares CORE1 (all exclusive slots filled)",
  );
  return { lane, baseUrl: laneToBase[lane] };
}

/**
 * Trials use only workers with no exclusive paid owner. If every slot has an exclusive paid owner,
 * trial Hetzner routing must fail (no sharing with paid).
 */
function allocateTrial(sessionId: number): CoreRoute {
  for (let i = 0; i < NUM_SLOTS; i++) {
    if (slotPaidOwner[i] === null) {
      slotTrialSessions[i].add(sessionId);
      const lane = (i + 1) as CoreLane;
      sessionToLane.set(sessionId, lane);
      logger.info({ sessionId, lane, numSlots: NUM_SLOTS }, "Hetzner core router: trial on idle worker");
      return { lane, baseUrl: laneToBase[lane] };
    }
  }
  logger.warn(
    { sessionId, numSlots: NUM_SLOTS },
    "Hetzner core router: trial Hetzner blocked — all workers reserved for paid sessions",
  );
  throw new Error("HETZNER_TRIAL_ALL_CORES_RESERVED_FOR_PAID");
}

function stickyStillValid(sessionId: number, paid: boolean, sticky: CoreLane): boolean {
  const laneNum = sticky;
  if (laneNum < 1 || laneNum > NUM_SLOTS) return false;
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
  for (let i = 0; i < 4; i++) {
    slotTrialSessions[i]!.delete(sessionId);
  }
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
  for (let i = 0; i < 4; i++) {
    if (slotPaidOwner[i] === sessionId) {
      slotPaidOwner[i] = null;
    }
    slotTrialSessions[i]!.delete(sessionId);
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
  for (let i = 0; i < NUM_SLOTS; i++) {
    if (slotPaidOwner[i] === null) {
      const lane = (i + 1) as CoreLane;
      return { lane, baseUrl: laneToBase[lane] };
    }
  }
  const fallbackLane = NUM_SLOTS as CoreLane;
  return { lane: fallbackLane, baseUrl: laneToBase[fallbackLane] };
}

export function logHetznerCoreRouterStartupHint(): void {
  const fourLaneRequested = readFourLaneRouterEnv();
  logger.info(
    {
      lanes: laneToBase,
      numSlots: NUM_SLOTS,
      fourLaneRouterEnv: fourLaneRequested,
      legacyEmergency: USE_LEGACY_EMERGENCY,
      legacyFallbackBase: LEGACY_TRANSLATE_BASE,
      paidExclusiveLaneFillOrder: NUM_SLOTS === 4 ? [1, 3, 4, 2] : [1, 2],
      semantics:
        NUM_SLOTS === 4
          ? "4 lanes: paid exclusives fill lanes 1→3→4→2 (spread hosts before CORE2); overflow paid share CORE1; trials idle slots only; rollback unset HETZNER_FOUR_LANE_ROUTER"
          : "2 lanes: paid claims exclusive CORE1/CORE2 in order; overflow paid share CORE1; trials only on idle cores; evict trials when paid claims",
    },
    USE_LEGACY_EMERGENCY
      ? "Hetzner core router: LEGACY SINGLE STACK (HETZNER_USE_LEGACY_SINGLE_STACK=1)"
      : NUM_SLOTS === 4
        ? "Hetzner core router: four workers — paid priority, trial idle fill — CORE3/CORE4 via env"
        : "Hetzner core router: two workers — paid priority, trial idle fill — see deploy/MEMORY-BUDGET-2LANE.md",
  );
}
