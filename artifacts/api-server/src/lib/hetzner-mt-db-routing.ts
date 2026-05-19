import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db, sessionsTable, usersTable, type User } from "@workspace/db";
import {
  getLiveTranslateEngineRouting,
  type TranslationRoutingUser,
} from "./usage.js";
import {
  allocatePaid,
  allocateTrial,
  createEmptySlotAllocatorState,
  seedCommittedLane,
  type SlotAllocatorState,
} from "./hetzner-slot-allocator.js";
import {
  getHetznerRoutingNumSlots,
  isPaidMachinePlanType,
  type CoreLane,
} from "./hetzner-core-router.js";
import { logger } from "./logger.js";

/** Serialize MT lane assignment / backfill across API replicas (PostgreSQL advisory lock). */
export const HETZNER_MT_ROUTING_ADVISORY_LOCK_KEY = 87236401;

export type HetznerMtDbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** `effectiveLane = manual_lane ?? assigned_lane` (nullable until migration / non-MT sessions). */
export function effectiveMtLane(
  manual: number | null | undefined,
  assigned: number | null | undefined,
): CoreLane | null {
  const m = manual != null && Number.isFinite(Number(manual)) ? Math.trunc(Number(manual)) : null;
  const a = assigned != null && Number.isFinite(Number(assigned)) ? Math.trunc(Number(assigned)) : null;
  const eff = (m != null && m >= 1 && m <= 4 ? m : null) ?? (a != null && a >= 1 && a <= 4 ? a : null);
  if (eff == null) return null;
  return eff as CoreLane;
}

function routingUserFromJoinedRow(r: {
  planType: string | null;
  trialEndsAt: Date | null;
  dailyLimitMinutes: number | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  isAdmin: boolean | null;
}): TranslationRoutingUser {
  return {
    planType: r.planType,
    trialEndsAt: r.trialEndsAt,
    dailyLimitMinutes: r.dailyLimitMinutes,
    subscriptionStatus: r.subscriptionStatus,
    subscriptionPlan: r.subscriptionPlan,
    isAdmin: r.isAdmin,
  };
}

/** Build allocator replay state from open sessions (excluding `excludeSessionId` if set). */
export function buildAllocatorStateFromOpenSessionsRows(
  rows: Array<{
    sessionId: number;
    hetznerMtManualLane: number | null;
    hetznerMtAssignedLane: number | null;
    planType: string | null;
    trialEndsAt: Date | null;
    dailyLimitMinutes: number | null;
    subscriptionStatus: string | null;
    subscriptionPlan: string | null;
    isAdmin: boolean | null;
  }>,
  excludeSessionId?: number,
): SlotAllocatorState {
  const numSlots = getHetznerRoutingNumSlots();
  const state = createEmptySlotAllocatorState(numSlots);

  const filtered = excludeSessionId == null ? rows : rows.filter((r) => r.sessionId !== excludeSessionId);
  const sorted = [...filtered].sort((a, b) => a.sessionId - b.sessionId);

  for (const r of sorted) {
    const ru = routingUserFromJoinedRow(r);
    const routing = getLiveTranslateEngineRouting(ru);
    if (!routing.useMachineTranslation) continue;

    const eff = effectiveMtLane(r.hetznerMtManualLane, r.hetznerMtAssignedLane);
    if (eff == null) continue;

    const paid = isPaidMachinePlanType(routing.effectivePlanTypeForTranslation);
    seedCommittedLane(state, r.sessionId, paid, eff);
  }

  return state;
}

export async function assignHetznerMtLaneForNewSessionInTx(
  tx: HetznerMtDbTx,
  newSessionId: number,
  userForRouting: User,
): Promise<void> {
  const routing = getLiveTranslateEngineRouting(userForRouting);
  if (!routing.useMachineTranslation) {
    return;
  }

  const rows = await tx
    .select({
      sessionId: sessionsTable.id,
      hetznerMtManualLane: sessionsTable.hetznerMtManualLane,
      hetznerMtAssignedLane: sessionsTable.hetznerMtAssignedLane,
      planType: usersTable.planType,
      trialEndsAt: usersTable.trialEndsAt,
      dailyLimitMinutes: usersTable.dailyLimitMinutes,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionPlan: usersTable.subscriptionPlan,
      isAdmin: usersTable.isAdmin,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(isNull(sessionsTable.endedAt), ne(sessionsTable.id, newSessionId)));

  const state = buildAllocatorStateFromOpenSessionsRows(rows, newSessionId);
  const paid = isPaidMachinePlanType(routing.effectivePlanTypeForTranslation);
  const lane = paid ? allocatePaid(state, newSessionId) : allocateTrial(state, newSessionId);

  await tx
    .update(sessionsTable)
    .set({ hetznerMtAssignedLane: lane })
    .where(eq(sessionsTable.id, newSessionId));
}

/** Clear persisted routing columns when a session ends (open-session routing only). */
export async function clearSessionHetznerRoutingColumns(sessionId: number): Promise<void> {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return;
  await db
    .update(sessionsTable)
    .set({
      hetznerMtManualLane: null,
      hetznerMtAssignedLane: null,
    })
    .where(eq(sessionsTable.id, sessionId));
}

/**
 * Startup backfill: open sessions that use MT but lack both lanes resolved get `hetzner_mt_assigned_lane`.
 * Runs in **one** transaction + advisory lock so ordering matches a single allocator view.
 */
export async function backfillOpenSessionsHetznerMtLanes(): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(87236401)`);

      const rows = await tx
        .select({
          sessionId: sessionsTable.id,
          hetznerMtManualLane: sessionsTable.hetznerMtManualLane,
          hetznerMtAssignedLane: sessionsTable.hetznerMtAssignedLane,
          planType: usersTable.planType,
          trialEndsAt: usersTable.trialEndsAt,
          dailyLimitMinutes: usersTable.dailyLimitMinutes,
          subscriptionStatus: usersTable.subscriptionStatus,
          subscriptionPlan: usersTable.subscriptionPlan,
          isAdmin: usersTable.isAdmin,
        })
        .from(sessionsTable)
        .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
        .where(isNull(sessionsTable.endedAt))
        .orderBy(sessionsTable.id);

      const state = createEmptySlotAllocatorState(getHetznerRoutingNumSlots());

      for (const r of rows) {
        const ru = routingUserFromJoinedRow(r);
        const routing = getLiveTranslateEngineRouting(ru);
        if (!routing.useMachineTranslation) continue;

        const existing = effectiveMtLane(r.hetznerMtManualLane, r.hetznerMtAssignedLane);
        const paid = isPaidMachinePlanType(routing.effectivePlanTypeForTranslation);

        if (existing != null) {
          seedCommittedLane(state, r.sessionId, paid, existing);
          continue;
        }

        try {
          const lane = paid ? allocatePaid(state, r.sessionId) : allocateTrial(state, r.sessionId);
          await tx
            .update(sessionsTable)
            .set({ hetznerMtAssignedLane: lane })
            .where(and(eq(sessionsTable.id, r.sessionId), isNull(sessionsTable.endedAt)));
        } catch (e) {
          logger.warn(
            { sessionId: r.sessionId, err: e instanceof Error ? e.message : String(e) },
            "Hetzner MT routing backfill: could not assign lane (trial blocked or allocator error)",
          );
        }
      }
    });
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "Hetzner MT routing backfill transaction failed");
  }
}
