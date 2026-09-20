import { db, sessionsTable, usersTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { computeBillableSecondsFromSessionRow } from "./session-billable-seconds.js";
import { sessionStore } from "./session-store.js";
import {
  getBillableMinutesUsedToday,
  getUserWithResetCheck,
  planUsesTrialSonioxX,
} from "./usage.js";

const SONIOX_COST_PER_MIN = 0.0025;

type OpenSessionBillingRow = {
  id: number;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  audioSecondsProcessed: number | null;
  lastActivityAt: Date | null;
  translationTokens: number | null;
};

async function creditClosedSessionToUser(
  userId: number,
  creditSeconds: number,
): Promise<{ minutesUsed: number }> {
  const minutesUsed = creditSeconds / 60;
  const user = await getUserWithResetCheck(userId);
  if (!user) return { minutesUsed };

  await db
    .update(usersTable)
    .set({
      minutesUsedToday: Number(user.minutesUsedToday ?? 0) + minutesUsed,
      totalMinutesUsed: Number(user.totalMinutesUsed ?? 0) + minutesUsed,
      totalSessions: Number(user.totalSessions ?? 0) + 1,
    })
    .where(eq(usersTable.id, userId));
  return { minutesUsed };
}

/**
 * End one open billing row and credit minutes (admin Terminate, stack switch, etc.).
 * Idempotent: already-ended sessions return closed:false and do not double-bill.
 */
export async function closeOpenSessionById(sessionId: number): Promise<{
  closed: boolean;
  userId: number | null;
  minutesUsed: number;
}> {
  const [row] = await db
    .select({
      id: sessionsTable.id,
      userId: sessionsTable.userId,
      startedAt: sessionsTable.startedAt,
      endedAt: sessionsTable.endedAt,
      durationSeconds: sessionsTable.durationSeconds,
      audioSecondsProcessed: sessionsTable.audioSecondsProcessed,
      lastActivityAt: sessionsTable.lastActivityAt,
      translationTokens: sessionsTable.translationTokens,
    })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.endedAt)))
    .limit(1);

  if (!row) {
    return { closed: false, userId: null, minutesUsed: 0 };
  }

  const billingRow: OpenSessionBillingRow = row;
  const creditSeconds = computeBillableSecondsFromSessionRow(billingRow);
  const sonioxCost = +((creditSeconds / 60) * SONIOX_COST_PER_MIN).toFixed(6);
  const updated = await db
    .update(sessionsTable)
    .set({
      endedAt: new Date(),
      durationSeconds: creditSeconds,
      audioSecondsProcessed: creditSeconds,
      sonioxCost: String(sonioxCost),
      totalSessionCost: sql`${sonioxCost} + COALESCE(${sessionsTable.translationCost}, 0)`,
      hetznerMtManualLane: null,
      hetznerMtAssignedLane: null,
    })
    .where(
      and(
        eq(sessionsTable.id, row.id),
        eq(sessionsTable.userId, row.userId),
        isNull(sessionsTable.endedAt),
      ),
    )
    .returning({ id: sessionsTable.id });

  if (!updated.length) {
    return { closed: false, userId: row.userId, minutesUsed: 0 };
  }

  sessionStore.delete(row.id);
  const { minutesUsed } = await creditClosedSessionToUser(row.userId, creditSeconds);
  return { closed: true, userId: row.userId, minutesUsed };
}

/**
 * Set `minutes_used_today` from session-history billable minutes (source of truth).
 * Fixes undercounts after admin terminate-without-credit or other drift.
 * Also bumps `total_minutes_used` by any positive today-delta so lifetime totals
 * catch up when Terminate previously closed the row without crediting.
 */
export async function reconcileUserMinutesUsedToday(userId: number): Promise<{
  previousMinutes: number;
  reconciledMinutes: number;
}> {
  const user = await getUserWithResetCheck(userId);
  if (!user) {
    throw new Error("User not found");
  }
  const previousMinutes = Number(user.minutesUsedToday ?? 0);
  const reconciledMinutes = await getBillableMinutesUsedToday(userId);
  const todayDelta = Math.max(0, reconciledMinutes - previousMinutes);
  await db
    .update(usersTable)
    .set({
      minutesUsedToday: reconciledMinutes,
      totalMinutesUsed: Number(user.totalMinutesUsed ?? 0) + todayDelta,
    })
    .where(eq(usersTable.id, userId));
  return { previousMinutes, reconciledMinutes };
}

/**
 * End every open billing row for a user and credit minutes.
 * Used when admin (or plan-test) switches stacks so the old session cannot linger
 * as a snapshot-less “ghost” on the live board.
 */
export async function closeOpenSessionsForUser(userId: number): Promise<number> {
  const open = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.endedAt)));

  if (open.length === 0) return 0;

  let closed = 0;
  for (const row of open) {
    const result = await closeOpenSessionById(row.id);
    if (result.closed) closed += 1;
  }
  return closed;
}

/** True when the workspace React tree swaps between Chunk v2 and isolated Soniox X. */
export function planSwitchRemountsWorkspace(
  previousPlanType: string | null | undefined,
  nextPlanType: string | null | undefined,
): boolean {
  return planUsesTrialSonioxX(previousPlanType) !== planUsesTrialSonioxX(nextPlanType);
}
