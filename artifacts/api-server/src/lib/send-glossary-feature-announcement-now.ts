import "../env-bootstrap.js";
import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendGlossaryFeatureAnnouncementEmailWithResult } from "./transactional-email.js";
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
 * One-time “Personal Glossary is live” product email (standard template + referral strip +
 * unsubscribe link). Idempotent: sets `glossary_feature_announcement_email_sent_at` after each
 * successful send. Skips users with `email_reminders_enabled = false` (promotional unsubscribe).
 *
 * Prerequisites: `DATABASE_URL`, `RESEND_API_KEY`, column `glossary_feature_announcement_email_sent_at`
 * on `users` (run `scripts/add-glossary-feature-announcement-email-sent-at-column.sql` or `pnpm db push`).
 *
 * Safety: set `CONFIRM_GLOSSARY_FEATURE_ANNOUNCEMENT=1` or the script exits without sending.
 * Dry run: `GLOSSARY_FEATURE_EMAIL_DRY_RUN=1` prints counts only.
 */
export async function runSendGlossaryFeatureAnnouncementNow(): Promise<void> {
  const dryRun = process.env.GLOSSARY_FEATURE_EMAIL_DRY_RUN === "1";

  if (!dryRun && process.env.CONFIRM_GLOSSARY_FEATURE_ANNOUNCEMENT !== "1") {
    const msg =
      "GLOSSARY FEATURE EMAIL: Refusing to send. Set CONFIRM_GLOSSARY_FEATURE_ANNOUNCEMENT=1 after reviewing the template in transactional-email.ts (or GLOSSARY_FEATURE_EMAIL_DRY_RUN=1 to count recipients only).";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }

  if (!isPostgresEnvConfigured()) {
    const msg = "GLOSSARY FEATURE EMAIL: No database URL in env (set DATABASE_URL). Aborting.";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }
  if (!dryRun && !isResendConfigured()) {
    const msg =
      "GLOSSARY FEATURE EMAIL: RESEND_API_KEY (or RESEND_KEY / RESEND_TOKEN) not set. Aborting.";
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
        isNull(usersTable.glossaryFeatureAnnouncementEmailSentAt),
        isNotNull(usersTable.email),
        eq(usersTable.emailRemindersEnabled, true),
      ),
    );

  const pending = rows.length;
  let attempted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let skippedInvalidEmail = 0;

  logger.info(
    { campaign: "glossary_feature_announcement", pending, batchSize, batchDelayMs, dryRun },
    "GLOSSARY FEATURE EMAIL: execution started",
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          campaign: "glossary_feature_announcement",
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
        campaign: "glossary_feature_announcement",
        batchStart: i + 1,
        batchEnd:   i + batch.length,
        total:      pending,
      },
      "GLOSSARY FEATURE EMAIL: processing batch",
    );

    for (const row of batch) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) {
        skippedInvalidEmail++;
        logger.warn(
          { campaign: "glossary_feature_announcement", userId: row.id, email: row.email },
          "GLOSSARY FEATURE EMAIL: skipped invalid email",
        );
        continue;
      }

      attempted++;
      const resendResult = await sendGlossaryFeatureAnnouncementEmailWithResult(to, { userId: row.id });
      if (resendResult.ok) {
        await db
          .update(usersTable)
          .set({ glossaryFeatureAnnouncementEmailSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        emailsSent++;
        logger.info(
          {
            campaign: "glossary_feature_announcement",
            userId: row.id,
            email: to,
            messageId: resendResult.messageId,
          },
          "GLOSSARY FEATURE EMAIL: sent",
        );
      } else {
        emailsFailed++;
        logger.error(
          {
            campaign: "glossary_feature_announcement",
            userId: row.id,
            email: to,
            resendResult,
          },
          "GLOSSARY FEATURE EMAIL: send failed (user not marked sent — safe to retry)",
        );
      }
    }

    if (i + batchSize < rows.length) {
      await sleep(batchDelayMs);
    }
  }

  const summary = {
    campaign: "glossary_feature_announcement",
    pendingRecipients: pending,
    attempted,
    emailsSent,
    emailsFailed,
    skippedInvalidEmail,
    batchSize,
    batchDelayMs,
  };
  logger.info(summary, "GLOSSARY FEATURE EMAIL: execution finished");
  console.log(JSON.stringify(summary, null, 2));

  if (attempted > 0 && emailsSent === 0 && emailsFailed > 0) {
    process.exitCode = 1;
  }
}

void runSendGlossaryFeatureAnnouncementNow().catch((err) => {
  console.error("GLOSSARY FEATURE EMAIL: execution failed:", err instanceof Error ? err.message : err);
  logger.error({ err }, "GLOSSARY FEATURE EMAIL: execution failed");
  process.exitCode = 1;
});
