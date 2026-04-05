import { db, usersTable } from "@workspace/db";
import { and, eq, gt, isNull, isNotNull, sql } from "drizzle-orm";
import { isResendConfigured } from "./resend-mail.js";
import { logger } from "./logger.js";
import { sendTrialReminderEmail } from "./transactional-email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trial users whose trial ends within the next 48 hours (and reminder not yet sent).
 */
export async function runTrialReminderJob(): Promise<void> {
  if (!isResendConfigured()) return;

  try {
    const rows = await db
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

    for (const row of rows) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) continue;

      const ok = await sendTrialReminderEmail(to, row.trialEndsAt, row.username);
      if (ok) {
        await db
          .update(usersTable)
          .set({ trialReminderSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        logger.info({ userId: row.id, email: to }, "Trial reminder email sent");
      }
    }
  } catch (err) {
    logger.error({ err }, "Trial reminder job failed");
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Run once shortly after boot, then every 24 hours. */
export function scheduleTrialReminderJob(): void {
  const run = () => void runTrialReminderJob();
  setTimeout(run, 60_000);
  setInterval(run, DAY_MS);
}
