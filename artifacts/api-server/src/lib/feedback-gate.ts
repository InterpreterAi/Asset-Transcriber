import { db, feedbackTable, type User } from "@workspace/db";
import { and, eq, gte, or, sql } from "drizzle-orm";
import { startOfAppDay } from "@workspace/app-timezone";
import { isTrialExpired, isTrialLikePlanType } from "./usage.js";

/** Stored on feedback rows; name kept for backwards compatibility with existing DB rows. */
export const MANDATORY_FEEDBACK_SOURCE = "trial-half-daily-mandatory";

/** Minimum comment length to count as satisfying the half-daily mandatory gate (stars alone are not enough). */
export const MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH = 10;

/** Optional UI source for the same form body; rows may be normalized to {@link MANDATORY_FEEDBACK_SOURCE} on insert. */
export const DAILY_PROMPT_FEEDBACK_SOURCE = "daily-prompt";

/** Same threshold as workspace UI: accounts at or above this daily cap are treated as unlimited. */
export const UNLIMITED_DAILY_CAP_MINUTES = 9000;

const REQUIRED_USAGE_RATIO = 0.5;

export function getMandatoryFeedbackThresholdMinutes(dailyLimitMinutes: number): number {
  const limit = Number(dailyLimitMinutes);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return limit * REQUIRED_USAGE_RATIO;
}

/**
 * Half-daily mandatory feedback applies to every account with a real daily meter,
 * except expired trials (cannot use the app) and “unlimited” caps.
 */
export function isMandatoryFeedbackEligible(user: User): boolean {
  if (isTrialLikePlanType(user.planType) && isTrialExpired(user)) return false;
  const dailyLimit = Number(user.dailyLimitMinutes);
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) return false;
  if (dailyLimit >= UNLIMITED_DAILY_CAP_MINUTES) return false;
  return true;
}

export function isMandatoryFeedbackRequiredByUsage(user: User): boolean {
  if (!isMandatoryFeedbackEligible(user)) return false;
  const used = Number(user.minutesUsedToday);
  const threshold = getMandatoryFeedbackThresholdMinutes(Number(user.dailyLimitMinutes));
  if (!Number.isFinite(used) || !Number.isFinite(threshold)) return false;
  return used >= threshold - 1e-6;
}

export async function hasSubmittedMandatoryFeedbackToday(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackTable)
    .where(
      and(
        eq(feedbackTable.userId, userId),
        gte(feedbackTable.createdAt, startOfAppDay()),
        gte(feedbackTable.rating, 1),
        or(
          eq(feedbackTable.source, MANDATORY_FEEDBACK_SOURCE),
          and(
            eq(feedbackTable.source, DAILY_PROMPT_FEEDBACK_SOURCE),
            sql`length(trim(coalesce(${feedbackTable.comment}, ''))) >= ${MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH}`,
          ),
        ),
      ),
    );
  return Number(row?.count ?? 0) > 0;
}
