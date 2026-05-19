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

if (!USE_LEGACY_EMERGENCY && readFourLaneRouterEnv() && NUM_SLOTS === 2) {
  logger.warn(
    {
      NUM_SLOTS,
      core3EnvDefined: Boolean((process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "").trim()),
      core4EnvDefined: Boolean((process.env.HETZNER_CORE4_TRANSLATE_BASE ?? "").trim()),
    },
    "Hetzner core router: HETZNER_FOUR_LANE_ROUTER is set but NUM_SLOTS=2 — runtime matches 2-lane semantics until both CORE3 and CORE4 URLs are non-empty",
  );
}

/** TEMPORARY: set `HETZNER_ROUTER_ALLOC_DEBUG=1` on Railway to log every `selectHetznerCoreRoute` outcome (verbose). Remove after verifying prod. */
function hetznerRouterAllocDebugEnabled(): boolean {
  return (process.env.HETZNER_ROUTER_ALLOC_DEBUG ?? "").trim() === "1";
}

function emitHetznerRouterSelectDebug(
  planType: string,
  sessionId: number | null,
  route: CoreRoute,
  decision: string,
): void {
  if (!hetznerRouterAllocDebugEnabled()) return;
  const paidPlan = isPaidMachinePlanType(planType);
  logger.info(
    {
      tag: "hetzner_router_select_debug",
      decision,
      sessionId,
      routingRole:
        sessionId != null ? (paidPlan ? "paid_session" : "trial_session") : paidPlan ? "anonymous_paid" : "anonymous_trial",
      assignedLane: route.lane,
      selectedBaseUrl: route.baseUrl,
      NUM_SLOTS,
      fourLaneRouterEnv: readFourLaneRouterEnv(),
      core3EnvDefined: Boolean((process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "").trim()),
      core4EnvDefined: Boolean((process.env.HETZNER_CORE4_TRANSLATE_BASE ?? "").trim()),
      laneToBase: { ...laneToBase },
      physicalSpreadSlotIndices: [...physicalSpreadSlotIndices()],
      legacyEmergency: USE_LEGACY_EMERGENCY,
    },
    "hetzner_router_select_debug",
  );
}

function finishSelect(planType: string, sid: number | null, route: CoreRoute, decision: string): CoreRoute {
  emitHetznerRouterSelectDebug(planType, sid, route, decision);
  return route;
}

/**
 * Slot indices for first-free scans when NUM_SLOTS===4: lanes **1 → 3 → 4 → 2**
 * (Ashburn :5001, Falkenstein :5001, Falkenstein :5002, then Ashburn :5002).
 * Used for paid exclusives and trial idle picking so load spreads across hosts before CORE2.
 */
function physicalSpreadSlotIndices(): readonly number[] {
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

/**
 * TEMPORARY: admin pins session → Hetzner lane (in-memory). Cleared on session end or Auto.
 * Does not participate in automatic slot reservation — see `releaseAutomaticHetznerReservation`.
 */
const manualCoreOverrideBySessionId = new Map<number, { lane: CoreLane; userEmail: string }>();

/** Drop automatic router bookkeeping for this session (slots + sticky). Does not touch manual override map. */
function releaseAutomaticHetznerReservation(sessionId: number): void {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return;
  sessionToLane.delete(sessionId);
  for (let i = 0; i < 4; i++) {
    if (slotPaidOwner[i] === sessionId) {
      slotPaidOwner[i] = null;
    }
    slotTrialSessions[i]!.delete(sessionId);
  }
}

/** Admin dashboard read — which lane is pinned, if any. */
export function getHetznerManualCoreOverride(sessionId: number): { lane: CoreLane; userEmail: string } | null {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return null;
  return manualCoreOverrideBySessionId.get(sessionId) ?? null;
}

/**
 * Set or clear manual Hetzner lane for a live session. Next MT request uses this lane (bypasses sticky/auto).
 * Clearing releases automatic reservations so Auto can re-allocate on the following request.
 */
export function setHetznerManualCoreOverride(sessionId: number, lane: CoreLane | null, userEmail: string): void {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return;
  releaseAutomaticHetznerReservation(sessionId);
  if (lane == null) {
    manualCoreOverrideBySessionId.delete(sessionId);
    return;
  }
  const email = userEmail.trim() || "(unknown)";
  manualCoreOverrideBySessionId.set(sessionId, { lane, userEmail: email });
}

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
  for (const idx of physicalSpreadSlotIndices()) {
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
function allocateTrial(sessionId: number, planType: string): CoreRoute {
  for (const i of physicalSpreadSlotIndices()) {
    if (i >= NUM_SLOTS) continue;
    if (slotPaidOwner[i] === null) {
      slotTrialSessions[i].add(sessionId);
      const lane = (i + 1) as CoreLane;
      sessionToLane.set(sessionId, lane);
      logger.info({ sessionId, lane, numSlots: NUM_SLOTS }, "Hetzner core router: trial on idle worker");
      return { lane, baseUrl: laneToBase[lane] };
    }
  }
  if (hetznerRouterAllocDebugEnabled()) {
    logger.info(
      {
        tag: "hetzner_router_select_debug",
        decision: "allocate_trial_blocked_all_slots_reserved",
        sessionId,
        NUM_SLOTS,
        fourLaneRouterEnv: readFourLaneRouterEnv(),
        core3EnvDefined: Boolean((process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "").trim()),
        core4EnvDefined: Boolean((process.env.HETZNER_CORE4_TRANSLATE_BASE ?? "").trim()),
        laneToBase: { ...laneToBase },
        slotPaidOwner: [...slotPaidOwner],
        physicalSpreadSlotIndices: [...physicalSpreadSlotIndices()],
      },
      "hetzner_router_select_debug",
    );
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
  manualCoreOverrideBySessionId.delete(sessionId);
  releaseAutomaticHetznerReservation(sessionId);
}

export function selectHetznerCoreRoute(planType: string, sessionId?: number): CoreRoute {
  const sid =
    typeof sessionId === "number" && Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null;

  if (USE_LEGACY_EMERGENCY) {
    return finishSelect(planType, sid, { lane: 1, baseUrl: laneToBase[1] }, "legacy_single_stack");
  }

  const paid = isPaidMachinePlanType(planType);

  if (sid != null) {
    const manual = manualCoreOverrideBySessionId.get(sid);
    if (manual != null) {
      const lane = manual.lane;
      const route = { lane, baseUrl: laneToBase[lane] };
      logger.info(
        {
          tag: "hetzner_manual_override",
          sessionId: sid,
          forcedLane: lane,
          selectedBaseUrl: route.baseUrl,
          userEmail: manual.userEmail,
          planType,
          NUM_SLOTS,
          laneBeyondNumSlots: lane > NUM_SLOTS,
        },
        "hetzner_manual_override",
      );
      return finishSelect(planType, sid, route, "manual_override");
    }

    const sticky = sessionToLane.get(sid);
    if (sticky != null) {
      if (stickyStillValid(sid, paid, sticky)) {
        return finishSelect(planType, sid, { lane: sticky, baseUrl: laneToBase[sticky] }, "sticky_hit");
      }
      invalidateSticky(sid);
    }
    const route = paid ? allocatePaid(sid) : allocateTrial(sid, planType);
    return finishSelect(planType, sid, route, paid ? "allocate_paid" : "allocate_trial");
  }

  if (paid) {
    return finishSelect(planType, null, { lane: 1, baseUrl: laneToBase[1] }, "anonymous_paid_core1");
  }
  for (const i of physicalSpreadSlotIndices()) {
    if (i >= NUM_SLOTS) continue;
    if (slotPaidOwner[i] === null) {
      const lane = (i + 1) as CoreLane;
      return finishSelect(planType, null, { lane, baseUrl: laneToBase[lane] }, "anonymous_trial_idle_slot");
    }
  }
  const fallbackLane = NUM_SLOTS as CoreLane;
  return finishSelect(
    planType,
    null,
    { lane: fallbackLane, baseUrl: laneToBase[fallbackLane] },
    "anonymous_trial_fallback",
  );
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
      core3EnvDefined: Boolean((process.env.HETZNER_CORE3_TRANSLATE_BASE ?? "").trim()),
      core4EnvDefined: Boolean((process.env.HETZNER_CORE4_TRANSLATE_BASE ?? "").trim()),
      hetznerRouterAllocDebug: hetznerRouterAllocDebugEnabled(),
      semantics:
        NUM_SLOTS === 4
          ? "4 lanes: paid/trial idle picks scan lanes 1→3→4→2; overflow paid share CORE1; rollback unset HETZNER_FOUR_LANE_ROUTER"
          : "2 lanes: exclusives scan 1→2; overflow paid share CORE1; trials idle cores only",
    },
    USE_LEGACY_EMERGENCY
      ? "Hetzner core router: LEGACY SINGLE STACK (HETZNER_USE_LEGACY_SINGLE_STACK=1)"
      : NUM_SLOTS === 4
        ? "Hetzner core router: four workers — physical spread slot order 1→3→4→2"
        : "Hetzner core router: two workers — paid priority, trial idle fill — see deploy/MEMORY-BUDGET-2LANE.md",
  );
}
