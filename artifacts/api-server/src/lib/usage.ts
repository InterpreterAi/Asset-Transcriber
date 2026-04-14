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

/** DB `plan_type` values treated as trial for expiry, reminders, and admin filters. */
export const TRIAL_LIKE_PLAN_TYPES = ["trial", "trial-openai", "trial-libre"] as const;

/** Trial-like plans: default signup `trial`, or admin-assigned `trial-openai` / `trial-libre`. */
export function isTrialLikePlanType(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return (TRIAL_LIKE_PLAN_TYPES as readonly string[]).includes(p);
}

/** True when `/translate` uses the machine stack (Libre / Google / MyMemory), not OpenAI. */
export function planUsesMachineTranslationStack(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return (
    p === "basic" ||
    p === "professional" ||
    p === "trial-libre" ||
    p === "platinum-libre"
  );
}

function isPaidTranslationPlan(eff: string): boolean {
  const e = eff.trim().toLowerCase();
  return (
    e === "basic" ||
    e === "basic-openai" ||
    e === "professional" ||
    e === "professional-openai" ||
    e === "platinum" ||
    e === "platinum-libre" ||
    e === "unlimited"
  );
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
 * When PayPal/webhooks lag, `plan_type` can stay trial-like while `subscription_plan` + `subscription_status`
 * already reflect paid Basic/Professional/Platinum. Use the subscription row for translation gating/engine
 * only in that case so paid tiers keep machine or OpenAI translation.
 */
export function effectivePlanTypeForTranslation(user: User): string {
  const p = (user.planType ?? "trial").trim().toLowerCase();
  const sub = (user.subscriptionStatus ?? "").trim().toLowerCase();
  const sp = (user.subscriptionPlan ?? "").trim().toLowerCase();
  if (
    sub === "active" &&
    (sp === "basic" || sp === "professional" || sp === "platinum" || sp === "unlimited") &&
    isTrialLikePlanType(user.planType)
  ) {
    return sp;
  }
  return p;
}

/**
 * Translation (POST /translate): which plans may call the translation endpoint.
 * Engine: `planUsesMachineTranslationStack(effectivePlanType)` vs OpenAI — see `transcription.ts`.
 */
export function translationEnabledForUser(user: User): boolean {
  const eff = effectivePlanTypeForTranslation(user);
  if (isPaidTranslationPlan(eff)) return true;
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
