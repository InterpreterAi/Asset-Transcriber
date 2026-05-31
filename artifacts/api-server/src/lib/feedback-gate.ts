import { db, feedbackTable, type User } from "@workspace/db";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import {
  APP_TIME_ZONE,
  appCalendarStartOfDayPlusDays,
  countAppTimezoneWeekdaysInclusive,
  startOfAppDay,
} from "@workspace/app-timezone";
import { isTrialExpired, isTrialLikePlanType } from "./usage.js";

/** Stored on feedback rows; name kept for backwards compatibility with existing DB rows. */
export const MANDATORY_FEEDBACK_SOURCE = "trial-half-daily-mandatory";

/** Paid accounts: required feedback after a session ends (never mid-call — gated when no open session). */
export const PAID_POST_SESSION_FEEDBACK_SOURCE = "paid-session-end-mandatory";

/** Minimum comment length to count as satisfying the half-daily mandatory gate (stars alone are not enough). */
export const MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH = 10;

/** Optional UI source for the same form body; rows may be normalized to {@link MANDATORY_FEEDBACK_SOURCE} on insert. */
export const DAILY_PROMPT_FEEDBACK_SOURCE = "daily-prompt";

/** Same threshold as workspace UI: accounts at or above this daily cap are treated as unlimited. */
export const UNLIMITED_DAILY_CAP_MINUTES = 9000;

/**
 * Paid post-session mandatory feedback: reduced frequency to **once per {@link WORKING_DAYS_BEFORE_PAID_FEEDBACK_REQUIRED_AFTER_SUBMISSION}
 * weekdays** (Mon–Fri, `{@link APP_TIME_ZONE}` calendar) after each qualifying submission — not every app calendar day.
 * Explicit allow-by-email list (lowercase). Request: Representative Cordova inbox (`acordova` / `cordova` aliases).
 */
const PAID_POST_SESSION_FEEDBACK_SPARSE_WORKING_DAY_EMAILS_LOWER = new Set([
  "acordova@representative.com",
  "cordova@representative.com",
]);

const WORKING_DAYS_BEFORE_PAID_FEEDBACK_REQUIRED_AFTER_SUBMISSION = 3;

export function paidPostSessionFeedbackSparseWorkingDayEligibleEmail(
  email: string | null | undefined,
): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e.length > 0 && PAID_POST_SESSION_FEEDBACK_SPARSE_WORKING_DAY_EMAILS_LOWER.has(e);
}

/** Weekdays (Mon–Fri, {@link APP_TIME_ZONE}) strictly after the submission calendar day through today's app day (inclusive). */
export function workingWeekdaysAfterSubmissionSubmissionDay(submittedAt: Date, ref: Date = new Date()): number {
  const firstDayAfterSubmission = appCalendarStartOfDayPlusDays(submittedAt, 1);
  const refDayStart = startOfAppDay(ref);
  return countAppTimezoneWeekdaysInclusive(firstDayAfterSubmission, refDayStart);
}

const REQUIRED_USAGE_RATIO = 0.5;

export function getMandatoryFeedbackThresholdMinutes(dailyLimitMinutes: number): number {
  const limit = Number(dailyLimitMinutes);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return limit * REQUIRED_USAGE_RATIO;
}

/**
 * Half-daily mandatory feedback mid-session: **active trial** accounts only (paid users defer until session end).
 */
export function isMandatoryFeedbackEligible(user: User): boolean {
  if (!isTrialLikePlanType(user.planType) || isTrialExpired(user)) return false;
  const dailyLimit = Number(user.dailyLimitMinutes);
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) return false;
  if (dailyLimit >= UNLIMITED_DAILY_CAP_MINUTES) return false;
  return true;
}

/** Paid (non–trial-like plan_type): same meter rules; blocks next session only after stop (see transcription routes). */
export function isPaidPostSessionFeedbackEligible(user: User): boolean {
  if (isTrialLikePlanType(user.planType)) return false;
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

/**
 * Same gate as {@link isMandatoryFeedbackRequiredByUsage}, but includes live
 * billable minutes from open sessions so in-session usage cannot bypass the
 * half-daily feedback prompt.
 */
export function isMandatoryFeedbackRequiredByUsageWithLive(
  user: User,
  liveBillableMinutes: number,
): boolean {
  if (!isMandatoryFeedbackEligible(user)) return false;
  const used = Number(user.minutesUsedToday);
  const live = Math.max(0, Number(liveBillableMinutes));
  const threshold = getMandatoryFeedbackThresholdMinutes(Number(user.dailyLimitMinutes));
  if (!Number.isFinite(used) || !Number.isFinite(threshold)) return false;
  return used + live >= threshold - 1e-6;
}

export function isPaidPostSessionFeedbackRequiredByUsage(user: User): boolean {
  if (!isPaidPostSessionFeedbackEligible(user)) return false;
  const used = Number(user.minutesUsedToday);
  const threshold = getMandatoryFeedbackThresholdMinutes(Number(user.dailyLimitMinutes));
  if (!Number.isFinite(used) || !Number.isFinite(threshold)) return false;
  return used >= threshold - 1e-6;
}

export async function hasSubmittedTrialMandatoryFeedbackToday(userId: number): Promise<boolean> {
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

export async function hasSubmittedPaidPostSessionFeedbackToday(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackTable)
    .where(
      and(
        eq(feedbackTable.userId, userId),
        gte(feedbackTable.createdAt, startOfAppDay()),
        gte(feedbackTable.rating, 1),
        eq(feedbackTable.source, PAID_POST_SESSION_FEEDBACK_SOURCE),
        sql`length(trim(coalesce(${feedbackTable.comment}, ''))) >= ${MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH}`,
      ),
    );
  return Number(row?.count ?? 0) > 0;
}

/**
 * Mandatory session gate satisfied — **once per account, ever** after any qualifying submission
 * (stars + min comment). Plan switches (trial ↔ paid ↔ *-openai) must not re-trigger the gate.
 */
export async function hasMandatoryFeedbackGateSatisfied(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackTable)
    .where(
      and(
        eq(feedbackTable.userId, userId),
        gte(feedbackTable.rating, 1),
        sql`length(trim(coalesce(${feedbackTable.comment}, ''))) >= ${MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH}`,
      ),
    );
  return Number(row?.count ?? 0) > 0;
}

async function latestPaidPostSessionMandatoryFeedbackSubmittedAt(userId: number): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: feedbackTable.createdAt })
    .from(feedbackTable)
    .where(
      and(
        eq(feedbackTable.userId, userId),
        gte(feedbackTable.rating, 1),
        eq(feedbackTable.source, PAID_POST_SESSION_FEEDBACK_SOURCE),
        sql`length(trim(coalesce(${feedbackTable.comment}, ''))) >= ${MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH}`,
      ),
    )
    .orderBy(desc(feedbackTable.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

/** Satisfies paid session-end FEEDBACK_REQUIRED gate (`/token`, session/start, `/feedback/status`). */
export async function hasPaidPostSessionFeedbackGateSatisfied(
  userId: number,
  userEmail: string | null | undefined,
): Promise<boolean> {
  if (!paidPostSessionFeedbackSparseWorkingDayEligibleEmail(userEmail)) {
    return hasSubmittedPaidPostSessionFeedbackToday(userId);
  }
  const lastAt = await latestPaidPostSessionMandatoryFeedbackSubmittedAt(userId);
  if (!lastAt) {
    return hasSubmittedPaidPostSessionFeedbackToday(userId);
  }
  if (
    workingWeekdaysAfterSubmissionSubmissionDay(lastAt, new Date()) <
    WORKING_DAYS_BEFORE_PAID_FEEDBACK_REQUIRED_AFTER_SUBMISSION
  ) {
    return true;
  }
  return hasSubmittedPaidPostSessionFeedbackToday(userId);
}