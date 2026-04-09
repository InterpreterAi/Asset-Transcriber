import "../env-bootstrap.js";
import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendStabilityBaselineUpdateEmailWithResult } from "./transactional-email.js";
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
 * Sends the stability / baseline product update email once per user (DB flag).
 * Safe to re-run: skips users who already have stabilityBaselineUpdateEmailSentAt set.
 *
 * Prerequisite: apply schema — from repo root, e.g. `pnpm --filter @workspace/db push`
 * so column `stability_baseline_update_email_sent_at` exists.
 */
export async function runSendStabilityBaselineUpdateNow(): Promise<void> {
  if (!isPostgresEnvConfigured()) {
    logger.error("STABILITY BASELINE EMAIL: Database URL not configured; aborting.");
    return;
  }
  if (!isResendConfigured()) {
    logger.error("STABILITY BASELINE EMAIL: RESEND_API_KEY not configured; aborting.");
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
        isNull(usersTable.stabilityBaselineUpdateEmailSentAt),
        isNotNull(usersTable.email),
      ),
    );

  const pending = rows.length;
  let attempted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let skippedInvalidEmail = 0;

  logger.info(
    { campaign: "stability_baseline_update", pending, batchSize, batchDelayMs },
    "STABILITY BASELINE EMAIL: execution started",
  );

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    logger.info(
      {
        campaign: "stability_baseline_update",
        batchStart: i + 1,
        batchEnd:   i + batch.length,
        total:      pending,
      },
      "STABILITY BASELINE EMAIL: processing batch",
    );

    for (const row of batch) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) {
        skippedInvalidEmail++;
        logger.warn(
          { campaign: "stability_baseline_update", userId: row.id, email: row.email },
          "STABILITY BASELINE EMAIL: skipped invalid email",
        );
        continue;
      }

      attempted++;
      const resendResult = await sendStabilityBaselineUpdateEmailWithResult(to, { userId: row.id });
      if (resendResult.ok) {
        await db
          .update(usersTable)
          .set({ stabilityBaselineUpdateEmailSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        emailsSent++;
        logger.info(
          {
            campaign: "stability_baseline_update",
            userId: row.id,
            email: to,
            messageId: resendResult.messageId,
          },
          "STABILITY BASELINE EMAIL: sent",
        );
      } else {
        emailsFailed++;
        logger.error(
          {
            campaign: "stability_baseline_update",
            userId: row.id,
            email: to,
            resendResult,
          },
          "STABILITY BASELINE EMAIL: send failed (user not marked sent — safe to retry)",
        );
      }
    }

    if (i + batchSize < rows.length) {
      await sleep(batchDelayMs);
    }
  }

  const summary = {
    campaign: "stability_baseline_update",
    pendingRecipients: pending,
    attempted,
    emailsSent,
    emailsFailed,
    skippedInvalidEmail,
    batchSize,
    batchDelayMs,
  };
  logger.info(summary, "STABILITY BASELINE EMAIL: execution finished");
  console.log(JSON.stringify(summary, null, 2));

  if (attempted > 0 && emailsSent === 0 && emailsFailed > 0) {
    process.exitCode = 1;
  }
}

void runSendStabilityBaselineUpdateNow().catch((err) => {
  logger.error({ err }, "STABILITY BASELINE EMAIL: execution failed");
  process.exitCode = 1;
});
