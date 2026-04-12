import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import { appCalendarDayChanged } from "@workspace/app-timezone";
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
  // Calendar day in America/New_York (product timezone for daily limits)
  return appCalendarDayChanged(lastReset, now);
}

export function getTrialDaysRemaining(user: User): number {
  const daily = Number(user.dailyLimitMinutes);
  if (!Number.isFinite(daily) || daily <= 0) return 0;
  const now = new Date();
  const end = new Date(user.trialEndsAt);
  if (!Number.isFinite(end.getTime()) || end.getTime() <= 0) return 0;
  const diff = end.getTime() - now.getTime();
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Trial-like plans: default signup `trial`, or admin-assigned `trial-openai` / `trial-libre`. */
export function isTrialLikePlanType(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return p === "trial" || p === "trial-openai" || p === "trial-libre";
}

/** True only when the user is on a trial-like plan, was granted a real trial window, and that window has ended. */
export function isTrialExpired(user: User): boolean {
  if (!isTrialLikePlanType(user.planType)) return false;
  const daily = Number(user.dailyLimitMinutes);
  if (!Number.isFinite(daily) || daily <= 0) return false;
  const end = new Date(user.trialEndsAt);
  if (!Number.isFinite(end.getTime()) || end.getTime() <= 0) return false;
  return new Date() > end;
}

/**
 * Translation (POST /translate): which plans may call the translation endpoint.
 * Engine: `basic`, `professional`, `trial-libre` → LibreTranslate only; otherwise
 * `platinum`, `unlimited`, `trial`, `trial-openai` → OpenAI (`gpt-4o-mini`) with full interpreter prompts.
 */
export function translationEnabledForUser(user: User): boolean {
  const p = (user.planType ?? "trial").trim().toLowerCase();
  if (p === "platinum" || p === "unlimited") return true;
  if (p === "basic" || p === "professional") return true;
  if (isTrialLikePlanType(user.planType)) return !isTrialExpired(user);
  return false;
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
    translationEnabled: translationEnabledForUser(user),
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
