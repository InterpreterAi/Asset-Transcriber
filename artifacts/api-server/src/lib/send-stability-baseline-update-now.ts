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
 * Prerequisite: column `stability_baseline_update_email_sent_at` on `users`.
 * If `pnpm --filter @workspace/db push` hangs, run instead:
 *   artifacts/api-server/scripts/add-stability-baseline-email-sent-at-column.sql
 * in your host’s SQL console, or: `cd lib/db && node run-drizzle-kit.cjs push --force`
 * (from repo root, with DATABASE_URL set).
 */
export async function runSendStabilityBaselineUpdateNow(): Promise<void> {
  if (!isPostgresEnvConfigured()) {
    const msg =
      "STABILITY BASELINE EMAIL: No database URL in env (set DATABASE_URL). Aborting.";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }
  if (!isResendConfigured()) {
    const msg =
      "STABILITY BASELINE EMAIL: RESEND_API_KEY (or RESEND_KEY / RESEND_TOKEN) not set. Aborting.";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
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
  const hint =
    err instanceof Error &&
    /column|stability_baseline|does not exist/i.test(err.message)
      ? " Hint: run artifacts/api-server/scripts/add-stability-baseline-email-sent-at-column.sql on your database, then retry."
      : "";
  console.error(
    "STABILITY BASELINE EMAIL: execution failed:",
    err instanceof Error ? err.message : err,
    hint,
  );
  logger.error({ err }, "STABILITY BASELINE EMAIL: execution failed");
  process.exitCode = 1;
});
