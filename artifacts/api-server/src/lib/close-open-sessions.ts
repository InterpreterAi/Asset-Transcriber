import { db, sessionsTable, usersTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { computeBillableSecondsFromSessionRow } from "./session-billable-seconds.js";
import { sessionStore } from "./session-store.js";
import { getUserWithResetCheck, planUsesTrialSonioxX } from "./usage.js";

const SONIOX_COST_PER_MIN = 0.0025;

/**
 * End every open billing row for a user and credit minutes.
 * Used when admin (or plan-test) switches stacks so the old session cannot linger
 * as a snapshot-less “ghost” on the live board.
 */
export async function closeOpenSessionsForUser(userId: number): Promise<number> {
  const open = await db
    .select({
      id: sessionsTable.id,
      startedAt: sessionsTable.startedAt,
      endedAt: sessionsTable.endedAt,
      durationSeconds: sessionsTable.durationSeconds,
      audioSecondsProcessed: sessionsTable.audioSecondsProcessed,
      lastActivityAt: sessionsTable.lastActivityAt,
      translationTokens: sessionsTable.translationTokens,
    })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.endedAt)));

  if (open.length === 0) return 0;

  const user = await getUserWithResetCheck(userId);
  let minutesUsedToday = user?.minutesUsedToday ?? 0;
  let totalMinutesUsed = user?.totalMinutesUsed ?? 0;
  let totalSessions = user?.totalSessions ?? 0;

  let closed = 0;
  for (const row of open) {
    const creditSeconds = computeBillableSecondsFromSessionRow(row);
    const minutesUsed = creditSeconds / 60;
    const sonioxCost = +(minutesUsed * SONIOX_COST_PER_MIN).toFixed(6);
    const updated = await db
      .update(sessionsTable)
      .set({
        endedAt: new Date(),
        durationSeconds: creditSeconds,
        audioSecondsProcessed: creditSeconds,
        sonioxCost: String(sonioxCost),
        totalSessionCost: sql`${sonioxCost} + COALESCE(translation_cost, 0)`,
        hetznerMtManualLane: null,
        hetznerMtAssignedLane: null,
      })
      .where(
        and(
          eq(sessionsTable.id, row.id),
          eq(sessionsTable.userId, userId),
          isNull(sessionsTable.endedAt),
        ),
      )
      .returning({ id: sessionsTable.id });
    if (!updated.length) continue;
    sessionStore.delete(row.id);
    closed += 1;
    minutesUsedToday += minutesUsed;
    totalMinutesUsed += minutesUsed;
    totalSessions += 1;
  }

  if (user && closed > 0) {
    await db
      .update(usersTable)
      .set({
        minutesUsedToday,
        totalMinutesUsed,
        totalSessions,
      })
      .where(eq(usersTable.id, userId));
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
