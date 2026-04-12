import { db, usersTable } from "@workspace/db";
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { appCalendarDateAndHour } from "@workspace/app-timezone";
import { isResendConfigured } from "./resend-mail.js";
import { logger } from "./logger.js";
import { sendTrialActiveReminderEmail } from "./transactional-email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseScheduledHour(raw: string | undefined, defaultHour: number, envKey: string): number {
  const trimmed = raw?.trim();
  const n = trimmed === undefined || trimmed === "" ? defaultHour : Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 23) {
    logger.warn({ [envKey]: raw }, `Trial active reminder: invalid ${envKey} — using hour ${defaultHour}`);
    return defaultHour;
  }
  return n;
}

/**
 * One-time “your trial is still active” campaign via Resend.
 *
 * **Not used for “send immediately”** — for that, run the manual script
 * `send-trial-users-reminder-now.ts` (or equivalent); it does not read these env vars.
 *
 * **Primary (America/New_York):** `TRIAL_ACTIVE_REMINDER_SEND_ON_APP_DATE=YYYY-MM-DD` must match
 * today’s calendar date in the product timezone. `TRIAL_ACTIVE_REMINDER_SEND_AFTER_APP_HOUR=0-23`
 * is the clock hour in America/New_York (sends only during that hour, e.g. `10` = 10:00–10:59 NY).
 *
 * **Legacy (UTC):** if `TRIAL_ACTIVE_REMINDER_SEND_ON_APP_DATE` is unset, the job still accepts
 * `TRIAL_ACTIVE_REMINDER_SEND_ON_UTC_DATE` and `TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR` with
 * UTC semantics (for existing deployments).
 *
 * Each eligible user is emailed at most once (`users.trial_active_reminder_sent_at`). Does not modify trial dates or limits.
 */
export function isTrialActiveReminderSendWindow(): boolean {
  const appDate = process.env.TRIAL_ACTIVE_REMINDER_SEND_ON_APP_DATE?.trim();
  const legacyUtcDate = process.env.TRIAL_ACTIVE_REMINDER_SEND_ON_UTC_DATE?.trim();
  const date = appDate || legacyUtcDate;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const now = new Date();

  if (appDate) {
    const { dateIso, hour } = appCalendarDateAndHour(now);
    if (dateIso !== date) return false;
    const scheduledHour = parseScheduledHour(
      process.env.TRIAL_ACTIVE_REMINDER_SEND_AFTER_APP_HOUR,
      12,
      "TRIAL_ACTIVE_REMINDER_SEND_AFTER_APP_HOUR",
    );
    return hour === scheduledHour;
  }

  const todayUtc = now.toISOString().slice(0, 10);
  if (todayUtc !== date) return false;
  const scheduledUtcHour = parseScheduledHour(
    process.env.TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR,
    12,
    "TRIAL_ACTIVE_REMINDER_SEND_AFTER_UTC_HOUR",
  );
  return now.getUTCHours() === scheduledUtcHour;
}

export async function runTrialActiveReminderJob(): Promise<void> {
  if (!isResendConfigured()) return;
  if (!isTrialActiveReminderSendWindow()) return;

  logger.info(
    { campaign: "trial_active_reminder" },
    "Trial active reminder job: execution started (scheduled date/hour window active)",
  );

  try {
    const eligibilityCore = and(
      eq(usersTable.planType, "trial"),
      eq(usersTable.isActive, true),
      eq(usersTable.emailVerified, true),
      isNull(usersTable.trialActiveReminderSentAt),
      isNull(usersTable.stripeSubscriptionId),
      gt(usersTable.trialEndsAt, new Date()),
      sql`${usersTable.trialEndsAt} > TIMESTAMP '1970-01-02'`,
      sql`${usersTable.dailyLimitMinutes} > 0`,
      isNotNull(usersTable.email),
    );

    const [eligibleRow, skippedUnsubRow, rows] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(usersTable).where(eligibilityCore),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(and(eligibilityCore, eq(usersTable.emailRemindersEnabled, false))),
      db
        .select({
          id: usersTable.id,
          email: usersTable.email,
        })
        .from(usersTable)
        .where(and(eligibilityCore, eq(usersTable.emailRemindersEnabled, true))),
    ]);

    const trialUsersEligible = eligibleRow[0]?.c ?? 0;
    const skippedDueToUnsubscribe = skippedUnsubRow[0]?.c ?? 0;
    const selectedForSend = rows.length;

    let emailsSent = 0;
    let emailsFailed = 0;
    let skippedInvalidEmail = 0;

    for (const row of rows) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) {
        skippedInvalidEmail++;
        continue;
      }

      const ok = await sendTrialActiveReminderEmail(to, { userId: row.id });
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
          "Trial active reminder email not sent (Resend returned failure — will retry next run in this hour if still eligible)",
        );
      }
    }

    logger.info(
      {
        campaign: "trial_active_reminder",
        trialUsersEligible,
        skippedDueToUnsubscribe,
        selectedForSend,
        emailsSentSuccessfully: emailsSent,
        emailsFailed,
        skippedInvalidEmail,
      },
      "Trial active reminder job: execution finished",
    );
  } catch (err) {
    logger.error({ err, campaign: "trial_active_reminder" }, "Trial active reminder job failed");
  }
}

/** Shorter than other mail jobs so a deploy shortly before the scheduled hour still ticks inside that hour. */
const REMINDER_TICK_MS = 5 * 60 * 1000;

/** Run once at boot, again after 1 minute, then every 5 minutes (only the matching date/hour sends). */
export function scheduleTrialActiveReminderJob(): void {
  const run = () => void runTrialActiveReminderJob();
  void runTrialActiveReminderJob();
  setTimeout(run, 60_000);
  setInterval(run, REMINDER_TICK_MS);
}
