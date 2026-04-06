import { db, usersTable } from "@workspace/db";
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { isResendConfigured } from "./resend-mail.js";
import { logger } from "./logger.js";
import { sendTrialActiveReminderEmail } from "./transactional-email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One-time “your trial is still active” campaign via Resend.
 *
 * **Opt-in:** set `TRIAL_ACTIVE_REMINDER_SEND_ON_UTC_DATE=YYYY-MM-DD` (UTC calendar date when sends are allowed).
 * Optional: `TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR` (0–23, default `12`) — no sends before this UTC hour on that date.
 *
 * Each eligible user is emailed at most once (`users.trial_active_reminder_sent_at`). Does not modify trial dates or limits.
 */
export function isTrialActiveReminderSendWindow(): boolean {
  const date = process.env.TRIAL_ACTIVE_REMINDER_SEND_ON_UTC_DATE?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  if (todayUtc !== date) return false;

  const rawHour = process.env.TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR?.trim();
  const minHour = rawHour === undefined || rawHour === "" ? 12 : Number(rawHour);
  if (!Number.isFinite(minHour) || minHour < 0 || minHour > 23) {
    logger.warn(
      { TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR: rawHour },
      "Trial active reminder: invalid TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR — using 12",
    );
    return now.getUTCHours() >= 12;
  }
  return now.getUTCHours() >= minHour;
}

export async function runTrialActiveReminderJob(): Promise<void> {
  if (!isResendConfigured()) return;
  if (!isTrialActiveReminderSendWindow()) return;

  try {
    const rows = await db
      .select({
        id:          usersTable.id,
        email:       usersTable.email,
        trialEndsAt: usersTable.trialEndsAt,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.planType, "trial"),
          eq(usersTable.isActive, true),
          eq(usersTable.emailVerified, true),
          isNull(usersTable.trialActiveReminderSentAt),
          isNull(usersTable.stripeSubscriptionId),
          gt(usersTable.trialEndsAt, new Date()),
          sql`${usersTable.trialEndsAt} > TIMESTAMP '1970-01-02'`,
          sql`${usersTable.dailyLimitMinutes} > 0`,
          isNotNull(usersTable.email),
        ),
      );

    if (rows.length === 0) {
      logger.info(
        { campaign: "trial_active_reminder" },
        "Trial active reminder job: no eligible users in this run",
      );
      return;
    }

    logger.info(
      { campaign: "trial_active_reminder", eligibleCount: rows.length },
      "Trial active reminder job: processing eligible users",
    );

    for (const row of rows) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) continue;

      const ok = await sendTrialActiveReminderEmail(to);
      if (ok) {
        await db
          .update(usersTable)
          .set({ trialActiveReminderSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        logger.info(
          {
            userId: row.id,
            email: to,
            campaign: "trial_active_reminder",
            trialEndsAt: row.trialEndsAt,
          },
          "Trial active reminder email sent",
        );
      } else {
        logger.warn(
          { userId: row.id, email: to, campaign: "trial_active_reminder" },
          "Trial active reminder email not sent (Resend returned failure — will retry next run if still eligible)",
        );
      }
    }
  } catch (err) {
    logger.error({ err, campaign: "trial_active_reminder" }, "Trial active reminder job failed");
  }
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/** First run a few minutes after boot, then every 15 minutes (same pattern as other mail jobs). */
export function scheduleTrialActiveReminderJob(): void {
  const run = () => void runTrialActiveReminderJob();
  setTimeout(run, 180_000);
  setInterval(run, FIFTEEN_MIN_MS);
}
