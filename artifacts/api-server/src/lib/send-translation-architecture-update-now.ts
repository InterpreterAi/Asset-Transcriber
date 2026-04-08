import "../env-bootstrap.js";
import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendTranslationArchitectureUpdateEmailWithResult } from "./transactional-email.js";
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

/**
 * Sends the “InterpreterAI Update — Translation Fixed & Improved” email once per user (DB flag).
 * Safe to re-run: skips users who already have translationArchitectureUpdateEmailSentAt set.
 */
export async function runSendTranslationArchitectureUpdateNow(): Promise<void> {
  if (!isPostgresEnvConfigured()) {
    logger.error("TRANSLATION UPDATE EMAIL: Database URL not configured; aborting.");
    return;
  }
  if (!isResendConfigured()) {
    logger.error("TRANSLATION UPDATE EMAIL: RESEND_API_KEY not configured; aborting.");
    return;
  }

  const batchSize = parsePositiveInt(process.env.REMINDER_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const batchDelayMs = parsePositiveInt(process.env.REMINDER_BATCH_DELAY_MS, DEFAULT_BATCH_DELAY_MS);

  const rows = await db
    .select({
      id:    usersTable.id,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(
      and(
        isNull(usersTable.translationArchitectureUpdateEmailSentAt),
        isNotNull(usersTable.email),
      ),
    );

  const pending = rows.length;
  let attempted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let skippedInvalidEmail = 0;

  logger.info(
    { campaign: "translation_architecture_update", pending, batchSize, batchDelayMs },
    "TRANSLATION UPDATE EMAIL: execution started",
  );

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    logger.info(
      {
        campaign: "translation_architecture_update",
        batchStart: i + 1,
        batchEnd:   i + batch.length,
        total:      pending,
      },
      "TRANSLATION UPDATE EMAIL: processing batch",
    );

    for (const row of batch) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) {
        skippedInvalidEmail++;
        logger.warn(
          { campaign: "translation_architecture_update", userId: row.id, email: row.email },
          "TRANSLATION UPDATE EMAIL: skipped invalid email",
        );
        continue;
      }

      attempted++;
      const resendResult = await sendTranslationArchitectureUpdateEmailWithResult(to, { userId: row.id });
      if (resendResult.ok) {
        await db
          .update(usersTable)
          .set({ translationArchitectureUpdateEmailSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        emailsSent++;
        logger.info(
          {
            campaign: "translation_architecture_update",
            userId: row.id,
            email: to,
            messageId: resendResult.messageId,
          },
          "TRANSLATION UPDATE EMAIL: sent",
        );
      } else {
        emailsFailed++;
        logger.error(
          {
            campaign: "translation_architecture_update",
            userId: row.id,
            email: to,
            resendResult,
          },
          "TRANSLATION UPDATE EMAIL: send failed (user not marked sent — safe to retry)",
        );
      }
    }

    if (i + batchSize < rows.length) {
      await sleep(batchDelayMs);
    }
  }

  const summary = {
    campaign: "translation_architecture_update",
    pendingRecipients: pending,
    attempted,
    emailsSent,
    emailsFailed,
    skippedInvalidEmail,
    batchSize,
    batchDelayMs,
  };
  logger.info(summary, "TRANSLATION UPDATE EMAIL: execution finished");
  console.log(JSON.stringify(summary, null, 2));

  if (attempted > 0 && emailsSent === 0 && emailsFailed > 0) {
    process.exitCode = 1;
  }
}

void runSendTranslationArchitectureUpdateNow().catch((err) => {
  logger.error({ err }, "TRANSLATION UPDATE EMAIL: execution failed");
  process.exitCode = 1;
});
