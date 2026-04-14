import { db, usersTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { TRIAL_LIKE_PLAN_TYPES } from "./usage.js";
import { isResendConfigured } from "./resend-mail.js";
import { logger } from "./logger.js";
import { sendGettingStartedEmail, sendTrialExpiredEmail } from "./transactional-email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Getting-started email (~12 minutes after signup, user verified) and trial-expired notice (once).
 */
export async function runOnboardingEmailJob(): Promise<void> {
  if (!isResendConfigured()) return;

  try {
    const gsRows = await db
      .select({
        id:    usersTable.id,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(
        and(
          isNull(usersTable.gettingStartedEmailSentAt),
          eq(usersTable.emailVerified, true),
          sql`${usersTable.createdAt} <= NOW() - INTERVAL '12 minutes'`,
          isNotNull(usersTable.email),
        ),
      );

    for (const row of gsRows) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) continue;

      // Greeting uses profileDisplayName only when we store a real name — never username.
      const ok = await sendGettingStartedEmail(to, null, row.id);
      if (ok) {
        await db
          .update(usersTable)
          .set({ gettingStartedEmailSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        logger.info({ userId: row.id, email: to }, "Getting started email sent");
      }
    }

    const expiredRows = await db
      .select({
        id:       usersTable.id,
        email:    usersTable.email,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(
        and(
          inArray(usersTable.planType, [...TRIAL_LIKE_PLAN_TYPES]),
          isNull(usersTable.trialExpiredEmailSentAt),
          sql`${usersTable.dailyLimitMinutes} > 0`,
          sql`${usersTable.trialEndsAt} > TIMESTAMP '1970-01-02'`,
          sql`${usersTable.trialEndsAt} < NOW()`,
          isNotNull(usersTable.email),
        ),
      );

    for (const row of expiredRows) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) continue;

      const ok = await sendTrialExpiredEmail(to, row.username, row.id);
      if (ok) {
        await db
          .update(usersTable)
          .set({ trialExpiredEmailSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        logger.info({ userId: row.id, email: to }, "Trial expired email sent");
      }
    }
  } catch (err) {
    logger.error({ err }, "Onboarding email job failed");
  }
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/** Run once immediately, again after 2 minutes, then every 15 minutes. */
export function scheduleOnboardingEmailJob(): void {
  const run = () => void runOnboardingEmailJob();
  void runOnboardingEmailJob();
  setTimeout(run, 120_000);
  setInterval(run, FIFTEEN_MIN_MS);
}
