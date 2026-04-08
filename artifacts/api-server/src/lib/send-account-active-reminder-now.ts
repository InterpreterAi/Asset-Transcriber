import "../env-bootstrap.js";
import { db, usersTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendAccountActiveReminderEmailWithResult } from "./transactional-email.js";
import { isPostgresEnvConfigured } from "../postgres-env.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BATCH_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export async function runSendAccountActiveReminderNow(): Promise<void> {
  if (!isPostgresEnvConfigured()) {
    logger.error("ACCOUNT ACTIVE REMINDER NOW: Database URL not configured; aborting.");
    return;
  }
  if (!isResendConfigured()) {
    logger.error("ACCOUNT ACTIVE REMINDER NOW: RESEND_API_KEY not configured; aborting.");
    return;
  }

  const batchSize = parsePositiveInt(process.env.REMINDER_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const batchDelayMs = parsePositiveInt(process.env.REMINDER_BATCH_DELAY_MS, DEFAULT_BATCH_DELAY_MS);

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(isNotNull(usersTable.email));

  const usersFound = rows.length;
  let attempted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let skippedInvalidEmail = 0;

  logger.info(
    { campaign: "account_active_reminder_now", usersFound, batchSize, batchDelayMs },
    "ACCOUNT ACTIVE REMINDER NOW: execution started",
  );

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    logger.info(
      {
        campaign: "account_active_reminder_now",
        batchStart: i + 1,
        batchEnd: i + batch.length,
        total: usersFound,
      },
      "ACCOUNT ACTIVE REMINDER NOW: processing batch",
    );

    for (const row of batch) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) {
        skippedInvalidEmail++;
        logger.warn(
          { campaign: "account_active_reminder_now", userId: row.id, email: row.email },
          "ACCOUNT ACTIVE REMINDER NOW: skipped invalid email",
        );
        continue;
      }

      attempted++;
      const resendResult = await sendAccountActiveReminderEmailWithResult(to, { userId: row.id });
      if (resendResult.ok) {
        emailsSent++;
        logger.info(
          {
            campaign: "account_active_reminder_now",
            userId: row.id,
            email: to,
            messageId: resendResult.messageId,
          },
          "ACCOUNT ACTIVE REMINDER NOW: email sent",
        );
      } else {
        emailsFailed++;
        logger.error(
          {
            campaign: "account_active_reminder_now",
            userId: row.id,
            email: to,
            resendResult,
          },
          "ACCOUNT ACTIVE REMINDER NOW: email failed",
        );
      }
    }

    if (i + batchSize < rows.length) {
      await sleep(batchDelayMs);
    }
  }

  const summary = {
    campaign: "account_active_reminder_now",
    usersFound,
    attempted,
    emailsSent,
    emailsFailed,
    skippedInvalidEmail,
    batchSize,
    batchDelayMs,
  };
  logger.info(summary, "ACCOUNT ACTIVE REMINDER NOW: execution finished");
  console.log(JSON.stringify(summary, null, 2));
}

void runSendAccountActiveReminderNow().catch((err) => {
  logger.error({ err }, "ACCOUNT ACTIVE REMINDER NOW: execution failed");
  process.exitCode = 1;
});
