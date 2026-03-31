import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { User } from "@workspace/db";

export async function touchActivity(userId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ lastActivity: new Date() })
    .where(eq(usersTable.id, userId));
}

export function resetDailyUsageIfNeeded(user: User): boolean {
  const now = new Date();
  const lastReset = new Date(user.lastUsageResetAt);
  const isNewDay =
    now.getFullYear() !== lastReset.getFullYear() ||
    now.getMonth() !== lastReset.getMonth() ||
    now.getDate() !== lastReset.getDate();
  return isNewDay;
}

export function getTrialDaysRemaining(user: User): number {
  const now = new Date();
  const end = new Date(user.trialEndsAt);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function isTrialExpired(user: User): boolean {
  return new Date() > new Date(user.trialEndsAt);
}

export async function getUserWithResetCheck(userId: number): Promise<User | undefined> {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) return undefined;

  const needsReset = resetDailyUsageIfNeeded(user);
  if (needsReset) {
    await db.update(usersTable)
      .set({ minutesUsedToday: 0, lastUsageResetAt: new Date() })
      .where(eq(usersTable.id, userId));
    user.minutesUsedToday = 0;
    user.lastUsageResetAt = new Date();
  }

  return user;
}

export function buildUserInfo(user: User) {
  const trialDaysRemaining = getTrialDaysRemaining(user);
  const trialExpired = isTrialExpired(user);
  const minutesRemainingToday = Math.max(0, user.dailyLimitMinutes - user.minutesUsedToday);
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
    dailyLimitMinutes: user.dailyLimitMinutes,
    minutesUsedToday: user.minutesUsedToday,
    minutesRemainingToday,
    totalMinutesUsed: user.totalMinutesUsed,
    totalSessions: user.totalSessions,
  };
}
