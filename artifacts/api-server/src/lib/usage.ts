import { db, usersTable, sessionsTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import type { User } from "@workspace/db";
import { appCalendarDayChanged, startOfAppDay } from "@workspace/app-timezone";
import { logger } from "./logger.js";

/** Row fields used for trial window, PayPal lag, and translation stack routing (nullable like DB + admin joins). */
export type TranslationRoutingUser = {
  planType: string | null | undefined;
  trialEndsAt: Date | string | null | undefined;
  dailyLimitMinutes: number | string | null | undefined;
  subscriptionStatus?: string | null | undefined;
  subscriptionPlan?: string | null | undefined;
};

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

export function getTrialDaysRemaining(user: TranslationRoutingUser): number {
  const daily = Number(user.dailyLimitMinutes);
  if (!Number.isFinite(daily) || daily <= 0) return 0;
  const now = new Date();
  if (user.trialEndsAt == null) return 0;
  const end = new Date(user.trialEndsAt);
  if (!Number.isFinite(end.getTime()) || end.getTime() <= 0) return 0;
  const diff = end.getTime() - now.getTime();
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** DB `plan_type` values treated as trial for expiry, reminders, and admin filters. */
export const TRIAL_LIKE_PLAN_TYPES = ["trial", "trial-openai", "trial-libre", "trial-hetzner"] as const;

/** Trial-like plans: default signup `trial-libre` (Final Boss 3), legacy `trial` / `trial-openai`, or `trial-libre`. */
export function isTrialLikePlanType(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return (TRIAL_LIKE_PLAN_TYPES as readonly string[]).includes(p);
}

/**
 * True when POST /translate must use the Libre/machine stack (not OpenAI).
 * Admin-assigned OpenAI plans (`trial`, `basic`, `professional`, `platinum`, `*-openai`) must route to OpenAI.
 * Libre routes are explicit `*-libre` plans (including default signup `trial-libre`).
 */
export function planUsesMachineTranslationStack(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  if (
    p === "trial-hetzner" ||
    p === "trial-libre" ||
    p === "basic-libre" ||
    p === "professional-libre" ||
    p === "platinum-libre"
  ) {
    return true;
  }
  if (
    p === "trial" ||
    p === "trial-openai" ||
    p === "basic" ||
    p === "basic-openai" ||
    p === "professional" ||
    p === "professional-openai" ||
    p === "platinum" ||
    p === "unlimited"
  ) {
    return false;
  }
  return p.endsWith("-libre");
}

/**
 * Live translation routing: strict engine isolation by effective plan type.
 * OpenAI plans always use OpenAI. Hetzner/machine plans always use machine.
 */
export function userUsesMachineTranslationStack(user: TranslationRoutingUser): boolean {
  const eff = effectivePlanTypeForTranslation(user).trim().toLowerCase();
  return planUsesMachineTranslationStack(eff);
}

function isPaidTranslationPlan(eff: string): boolean {
  const e = eff.trim().toLowerCase();
  return (
    e === "basic" ||
    e === "basic-openai" ||
    e === "basic-libre" ||
    e === "morsy-basic" ||
    e === "professional" ||
    e === "professional-openai" ||
    e === "professional-libre" ||
    e === "platinum" ||
    e === "platinum-libre" ||
    e === "unlimited"
  );
}

/**
 * Trial (non-paid-effective) accounts: stricter AI/transcription rate limits and outbound Hetzner concurrency.
 * Admins and paid-effective rows (subscription lag) are excluded.
 */
export function appliesStrictTrialAiThrottle(
  user: TranslationRoutingUser & { isAdmin?: boolean | null },
): boolean {
  if (user.isAdmin) return false;
  const eff = effectivePlanTypeForTranslation(user).trim().toLowerCase();
  if (isPaidTranslationPlan(eff)) return false;
  return isTrialLikePlanType(user.planType) && !isTrialExpired(user);
}

/** True only when the user is on a trial-like plan, was granted a real trial window, and that window has ended. */
export function isTrialExpired(user: TranslationRoutingUser): boolean {
  if (!isTrialLikePlanType(user.planType)) return false;
  const daily = Number(user.dailyLimitMinutes);
  if (!Number.isFinite(daily) || daily <= 0) return false;
  if (user.trialEndsAt == null) return false;
  const end = new Date(user.trialEndsAt);
  if (!Number.isFinite(end.getTime()) || end.getTime() <= 0) return false;
  return new Date() > end;
}

/**
 * When PayPal/webhooks lag, `plan_type` can stay trial-like while `subscription_plan` + `subscription_status`
 * already reflect paid Basic/Professional/Platinum. Use the subscription row for translation gating/engine
 * only in that case so paid tiers keep machine or OpenAI translation.
 */
export function effectivePlanTypeForTranslation(user: TranslationRoutingUser): string {
  const p = (user.planType ?? "trial-openai").trim().toLowerCase();
  const sub = (user.subscriptionStatus ?? "").trim().toLowerCase();
  const sp = (user.subscriptionPlan ?? "").trim().toLowerCase();
  if (
    sub === "active" &&
    (sp === "basic" || sp === "professional" || sp === "platinum" || sp === "unlimited") &&
    isTrialLikePlanType(user.planType)
  ) {
    // Webhook-lag mapping: mixed-trial rows map Basic/Prof to Libre stacks; Platinum/Unlimited → OpenAI.
    if (p === "trial-libre") {
      if (sp === "basic") return "basic-libre";
      if (sp === "professional") return "professional-libre";
      if (sp === "platinum") return "platinum";
      if (sp === "unlimited") return "unlimited";
    }
    return sp;
  }
  return p;
}

/**
 * Translation (POST /translate): which plans may call the translation endpoint.
 * Engine choice follows `plan_type`: `*-libre` tiers use machine translation; others use the OpenAI
 * interpreter stack when the key is configured (`transcription.ts`).
 */
export function translationEnabledForUser(user: User): boolean {
  const eff = effectivePlanTypeForTranslation(user);
  if (isPaidTranslationPlan(eff)) return true;
  if (isTrialLikePlanType(user.planType)) return !isTrialExpired(user);
  return false;
}

/**
 * Billable minutes credited today (app calendar), aligned with daily-cap checks:
 * closed sessions use stored audio/duration seconds; open sessions use
 * `audio_seconds_processed` only (same basis as open-session billing in transcription routes).
 */
export async function getBillableMinutesUsedToday(userId: number): Promise<number> {
  const todayStart = startOfAppDay();
  const [row] = await db
    .select({
      minutesToday: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN ${sessionsTable.endedAt} IS NULL
                THEN COALESCE(${sessionsTable.audioSecondsProcessed}, 0)
              ELSE COALESCE(${sessionsTable.audioSecondsProcessed}, ${sessionsTable.durationSeconds}, 0)
            END
          ),
          0
        ) / 60.0`,
    })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), gte(sessionsTable.startedAt, todayStart)));
  return Number(row?.minutesToday ?? 0);
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
  const isPaidPlan = !isTrialLikePlanType(user.planType);
  const paidPeriodEnd =
    user.subscriptionPeriodEndsAt != null ? new Date(user.subscriptionPeriodEndsAt) : null;
  const paidCycleDaysRemaining =
    isPaidPlan && paidPeriodEnd && Number.isFinite(paidPeriodEnd.getTime())
      ? Math.max(0, Math.ceil((paidPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;
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
    planType: user.planType ?? "trial-openai",
    translationEnabled: translationEnabledForUser(user),
    emailVerified: user.emailVerified ?? false,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
    trialDaysRemaining,
    trialExpired,
    paidCycleDaysRemaining,
    dailyLimitMinutes: Number.isFinite(dailyLimit) ? dailyLimit : user.dailyLimitMinutes,
    minutesUsedToday: Number.isFinite(usedToday) ? usedToday : user.minutesUsedToday,
    minutesRemainingToday,
    totalMinutesUsed: Number(user.totalMinutesUsed) || 0,
    totalSessions: Number(user.totalSessions) || 0,
  };
}
