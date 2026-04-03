import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import { logger } from "./logger.js";

export async function touchActivity(userId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ lastActivity: new Date() })
    .where(eq(usersTable.id, userId));
}

export function resetDailyUsageIfNeeded(user: User): boolean {
  const now = new Date();
  const lastReset = new Date(user.lastUsageResetAt);
  if (!Number.isFinite(lastReset.getTime())) return false;
  // Always compare UTC calendar dates so "today" is consistent regardless of server timezone
  const isNewDay =
    now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
    now.getUTCMonth()    !== lastReset.getUTCMonth()    ||
    now.getUTCDate()     !== lastReset.getUTCDate();
  return isNewDay;
}

export function getTrialDaysRemaining(user: User): number {
  const now = new Date();
  const end = new Date(user.trialEndsAt);
  const diff = end.getTime() - now.getTime();
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function isTrialExpired(user: User): boolean {
  const end = new Date(user.trialEndsAt);
  if (!Number.isFinite(end.getTime())) return false;
  return new Date() > end;
}

export async function getUserWithResetCheck(userId: number): Promise<User | undefined> {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) return undefined;

  try {
    const needsReset = resetDailyUsageIfNeeded(user);
    if (needsReset) {
      await db
        .update(usersTable)
        .set({ minutesUsedToday: 0, lastUsageResetAt: new Date() })
        .where(eq(usersTable.id, userId));
      user.minutesUsedToday = 0;
      user.lastUsageResetAt = new Date();
    }
  } catch (err) {
    logger.warn({ err, userId }, "getUserWithResetCheck: daily reset skipped");
  }

  return user;
}

export function buildUserInfo(user: User) {
  const trialDaysRemaining = getTrialDaysRemaining(user);
  const trialExpired = isTrialExpired(user);
  const dailyLimit = Number(user.dailyLimitMinutes);
  const usedToday = Number(user.minutesUsedToday);
  const minutesRemainingToday = Math.max(
    0,
    (Number.isFinite(dailyLimit) ? dailyLimit : 0) - (Number.isFinite(usedToday) ? usedToday : 0),
  );
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? undefined,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    planType: user.planType ?? "trial",
    emailVerified: user.emailVerified ?? false,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
    trialDaysRemaining,
    trialExpired,
    dailyLimitMinutes: Number.isFinite(dailyLimit) ? dailyLimit : user.dailyLimitMinutes,
    minutesUsedToday: Number.isFinite(usedToday) ? usedToday : user.minutesUsedToday,
    minutesRemainingToday,
    totalMinutesUsed: Number(user.totalMinutesUsed) || 0,
    totalSessions: Number(user.totalSessions) || 0,
  };
}
