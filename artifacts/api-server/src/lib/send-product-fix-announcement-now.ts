import "../env-bootstrap.js";
import { db, usersTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendProductFixAnnouncementEmailWithResult } from "./transactional-email.js";
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
 * Sends the “We fixed it — and here’s what changed” broadcast to every user with a valid email.
 * Does not change plans, billing, or quotas — email only.
 *
 * Prerequisites: DATABASE_URL, RESEND_API_KEY (see other `email:*` scripts).
 *
 * Safety: set CONFIRM_PRODUCT_FIX_BROADCAST=1 or the script exits without sending.
 * Dry run: PRODUCT_FIX_EMAIL_DRY_RUN=1 logs counts only.
 */
export async function runSendProductFixAnnouncementNow(): Promise<void> {
  const dryRun = process.env.PRODUCT_FIX_EMAIL_DRY_RUN === "1";

  if (!dryRun && process.env.CONFIRM_PRODUCT_FIX_BROADCAST !== "1") {
    const msg =
      "PRODUCT FIX EMAIL: Refusing to send. Set CONFIRM_PRODUCT_FIX_BROADCAST=1 after reviewing the template in transactional-email.ts (or PRODUCT_FIX_EMAIL_DRY_RUN=1 to count recipients only).";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }

  if (!isPostgresEnvConfigured()) {
    const msg = "PRODUCT FIX EMAIL: No database URL in env (set DATABASE_URL). Aborting.";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }
  if (!dryRun && !isResendConfigured()) {
    const msg =
      "PRODUCT FIX EMAIL: RESEND_API_KEY (or RESEND_KEY / RESEND_TOKEN) not set. Aborting.";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
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

  const pending = rows.length;
  let attempted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let skippedInvalidEmail = 0;

  logger.info(
    { campaign: "product_fix_announcement", pending, batchSize, batchDelayMs, dryRun },
    "PRODUCT FIX EMAIL: execution started",
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          campaign: "product_fix_announcement",
          dryRun: true,
          pendingRecipients: pending,
        },
        null,
        2,
      ),
    );
    return;
  }

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    logger.info(
      {
        campaign: "product_fix_announcement",
        batchStart: i + 1,
        batchEnd: i + batch.length,
        total: pending,
      },
      "PRODUCT FIX EMAIL: processing batch",
    );

    for (const row of batch) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) {
        skippedInvalidEmail++;
        logger.warn(
          { campaign: "product_fix_announcement", userId: row.id, email: row.email },
          "PRODUCT FIX EMAIL: skipped invalid email",
        );
        continue;
      }

      attempted++;
      const resendResult = await sendProductFixAnnouncementEmailWithResult(to);
      if (resendResult.ok) {
        emailsSent++;
        logger.info(
          {
            campaign: "product_fix_announcement",
            userId: row.id,
            email: to,
            messageId: resendResult.messageId,
          },
          "PRODUCT FIX EMAIL: sent",
        );
      } else {
        emailsFailed++;
        logger.error(
          {
            campaign: "product_fix_announcement",
            userId: row.id,
            email: to,
            resendResult,
          },
          "PRODUCT FIX EMAIL: send failed",
        );
      }
    }

    if (i + batchSize < rows.length) {
      await sleep(batchDelayMs);
    }
  }

  const summary = {
    campaign: "product_fix_announcement",
    pendingRecipients: pending,
    attempted,
    emailsSent,
    emailsFailed,
    skippedInvalidEmail,
    batchSize,
    batchDelayMs,
  };
  logger.info(summary, "PRODUCT FIX EMAIL: execution finished");
  console.log(JSON.stringify(summary, null, 2));

  if (attempted > 0 && emailsSent === 0 && emailsFailed > 0) {
    process.exitCode = 1;
  }
}

void runSendProductFixAnnouncementNow().catch((err) => {
  console.error("PRODUCT FIX EMAIL: execution failed:", err instanceof Error ? err.message : err);
  logger.error({ err }, "PRODUCT FIX EMAIL: execution failed");
  process.exitCode = 1;
});
