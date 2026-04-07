import { db, usersTable } from "@workspace/db";
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { isResendConfigured } from "./resend-mail.js";
import { logger } from "./logger.js";
import { sendTrialActiveReminderEmail } from "./transactional-email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One-time “your trial is still active” campaign via Resend.
 *
 * **Not used for “send immediately”** — for that, run the manual script
 * `send-trial-users-reminder-now.ts` (or equivalent); it does not read these env vars.
 *
 * **Opt-in (UTC only):** `TRIAL_ACTIVE_REMINDER_SEND_ON_UTC_DATE=YYYY-MM-DD` must match **today’s date in UTC**
 * (`toISOString().slice(0,10)` on the server), not your local or Egypt calendar day if that day differs.
 * `TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR=0-23` is the **UTC hour** (sends only during that hour, e.g. `10` = 10:00–10:59 UTC).
 *
 * Example — 12:00 PM Egypt (UTC+2, no DST) on 6 Apr 2026:
 *   TRIAL_ACTIVE_REMINDER_SEND_ON_UTC_DATE=2026-04-06
 *   TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR=10
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
  const scheduledUtcHour = rawHour === undefined || rawHour === "" ? 12 : Number(rawHour);
  if (!Number.isFinite(scheduledUtcHour) || scheduledUtcHour < 0 || scheduledUtcHour > 23) {
    logger.warn(
      { TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR: rawHour },
      "Trial active reminder: invalid TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR — using UTC hour 12",
    );
    return now.getUTCHours() === 12;
  }
  return now.getUTCHours() === scheduledUtcHour;
}

export async function runTrialActiveReminderJob(): Promise<void> {
  if (!isResendConfigured()) return;
  if (!isTrialActiveReminderSendWindow()) return;

  logger.info(
    { campaign: "trial_active_reminder" },
    "Trial active reminder job: execution started (scheduled UTC date/hour window active)",
  );

  try {
    const rows = await db
      .select({
        id:    usersTable.id,
        email: usersTable.email,
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

    const usersFound = rows.length;
    let emailsSent = 0;
    let emailsFailed = 0;
    let skippedInvalidEmail = 0;

    for (const row of rows) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) {
        skippedInvalidEmail++;
        continue;
      }

      const ok = await sendTrialActiveReminderEmail(to);
      if (ok) {
        await db
          .update(usersTable)
          .set({ trialActiveReminderSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        emailsSent++;
      } else {
        emailsFailed++;
        logger.warn(
          { userId: row.id, email: to, campaign: "trial_active_reminder" },
          "Trial active reminder email not sent (Resend returned failure — will retry next run in this UTC hour if still eligible)",
        );
      }
    }

    logger.info(
      {
        campaign: "trial_active_reminder",
        usersFound,
        emailsSent,
        emailsFailed,
        skippedInvalidEmail,
      },
      "Trial active reminder job: execution finished",
    );
  } catch (err) {
    logger.error({ err, campaign: "trial_active_reminder" }, "Trial active reminder job failed");
  }
}

/** Shorter than other mail jobs so a deploy shortly before the scheduled UTC hour still ticks inside that hour. */
const REMINDER_TICK_MS = 5 * 60 * 1000;

/** First run 1 minute after boot, then every 5 minutes (only the matching UTC date/hour does work). */
export function scheduleTrialActiveReminderJob(): void {
  const run = () => void runTrialActiveReminderJob();
  setTimeout(run, 60_000);
  setInterval(run, REMINDER_TICK_MS);
}
