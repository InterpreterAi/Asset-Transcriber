import { db, feedbackTable, type User } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { isTrialExpired } from "./usage.js";

export const MANDATORY_FEEDBACK_SOURCE = "trial-half-daily-mandatory";
const MIN_TRIAL_DAILY_LIMIT_MINUTES = 60;
const REQUIRED_USAGE_RATIO = 0.5;

export function getMandatoryFeedbackThresholdMinutes(dailyLimitMinutes: number): number {
  const limit = Number(dailyLimitMinutes);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return limit * REQUIRED_USAGE_RATIO;
}

export function isMandatoryTrialFeedbackEligible(user: User): boolean {
  const dailyLimit = Number(user.dailyLimitMinutes);
  return (
    user.planType === "trial" &&
    !isTrialExpired(user) &&
    Number.isFinite(dailyLimit) &&
    dailyLimit >= MIN_TRIAL_DAILY_LIMIT_MINUTES
  );
}

export function isMandatoryFeedbackRequiredByUsage(user: User): boolean {
  if (!isMandatoryTrialFeedbackEligible(user)) return false;
  const used = Number(user.minutesUsedToday);
  const threshold = getMandatoryFeedbackThresholdMinutes(Number(user.dailyLimitMinutes));
  if (!Number.isFinite(used) || !Number.isFinite(threshold)) return false;
  return used >= threshold - 1e-6;
}

function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function hasSubmittedMandatoryFeedbackToday(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackTable)
    .where(
      and(
        eq(feedbackTable.userId, userId),
        eq(feedbackTable.source, MANDATORY_FEEDBACK_SOURCE),
        gte(feedbackTable.createdAt, utcDayStart()),
      ),
    );
  return Number(row?.count ?? 0) > 0;
}
