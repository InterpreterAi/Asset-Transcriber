import { db, usersTable } from "@workspace/db";
import { getTrialDaysRemaining } from "./usage.js";
import { logger } from "./logger.js";
import { sendTrialActiveReminderEmail } from "./transactional-email.js";
import { isResendConfigured } from "./resend-mail.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function runSendTrialActiveReminderNow(): Promise<void> {
  if (!isResendConfigured()) {
    logger.error("TRIAL REMINDER NOW: RESEND_API_KEY not configured; aborting.");
    return;
  }

  const rows = await db.select().from(usersTable);
  const usersFound = rows.length;
  let emailsSent = 0;
  let skippedNoEmail = 0;
  let failed = 0;

  logger.info({ campaign: "trial_active_reminder_now", usersFound }, "TRIAL REMINDER NOW: execution started");

  for (const row of rows) {
    const to = row.email?.trim().toLowerCase() ?? "";
    if (!to || !EMAIL_RE.test(to)) {
      skippedNoEmail++;
      continue;
    }

    const daysRemaining = getTrialDaysRemaining(row);
    const ok = await sendTrialActiveReminderEmail(to, {
      trialEndsAt: row.trialEndsAt,
      daysRemaining,
    });
    if (ok) emailsSent++;
    else failed++;
  }

  logger.info(
    {
      campaign: "trial_active_reminder_now",
      usersFound,
      emailsSent,
      failed,
      skippedNoEmail,
    },
    "TRIAL REMINDER NOW: execution finished",
  );

  // Keep a clear summary in terminal output as requested.
  console.log(
    JSON.stringify(
      {
        campaign: "trial_active_reminder_now",
        usersFound,
        emailsSent,
        failed,
        skippedNoEmail,
      },
      null,
      2,
    ),
  );
}

void runSendTrialActiveReminderNow().catch((err) => {
  logger.error({ err }, "TRIAL REMINDER NOW: execution failed");
  process.exitCode = 1;
});
