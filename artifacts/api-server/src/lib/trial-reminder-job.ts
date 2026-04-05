import { db, usersTable } from "@workspace/db";
import { and, eq, gt, isNull, isNotNull, sql } from "drizzle-orm";
import { isResendConfigured } from "./resend-mail.js";
import { logger } from "./logger.js";
import { sendTrialReminder12hEmail, sendTrialReminder48hEmail } from "./transactional-email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function runTrialReminderJob(): Promise<void> {
  if (!isResendConfigured()) return;

  try {
    const rows48 = await db
      .select({
        id:          usersTable.id,
        email:       usersTable.email,
        username:    usersTable.username,
        trialEndsAt: usersTable.trialEndsAt,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.planType, "trial"),
          isNull(usersTable.trialReminderSentAt),
          gt(usersTable.trialEndsAt, new Date()),
          sql`${usersTable.trialEndsAt} <= NOW() + INTERVAL '48 hours'`,
          isNotNull(usersTable.email),
        ),
      );

    for (const row of rows48) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) continue;

      const ok = await sendTrialReminder48hEmail(to, row.trialEndsAt, row.username);
      if (ok) {
        await db
          .update(usersTable)
          .set({ trialReminderSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        logger.info({ userId: row.id, email: to }, "Trial 48h reminder email sent");
      }
    }

    const rows12 = await db
      .select({
        id:          usersTable.id,
        email:       usersTable.email,
        username:    usersTable.username,
        trialEndsAt: usersTable.trialEndsAt,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.planType, "trial"),
          isNull(usersTable.trialReminder12hSentAt),
          gt(usersTable.trialEndsAt, new Date()),
          sql`${usersTable.trialEndsAt} <= NOW() + INTERVAL '12 hours'`,
          isNotNull(usersTable.email),
        ),
      );

    for (const row of rows12) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) continue;

      const ok = await sendTrialReminder12hEmail(to, row.trialEndsAt, row.username);
      if (ok) {
        await db
          .update(usersTable)
          .set({ trialReminder12hSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        logger.info({ userId: row.id, email: to }, "Trial 12h reminder email sent");
      }
    }
  } catch (err) {
    logger.error({ err }, "Trial reminder job failed");
  }
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/** Run shortly after boot and every 15 minutes so 12h / 48h windows are hit reliably. */
export function scheduleTrialReminderJob(): void {
  const run = () => void runTrialReminderJob();
  setTimeout(run, 60_000);
  setInterval(run, FIFTEEN_MIN_MS);
}
