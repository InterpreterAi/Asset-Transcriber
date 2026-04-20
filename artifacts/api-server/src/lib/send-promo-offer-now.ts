import "../env-bootstrap.js";
import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendPromoOfferEmailWithResult } from "./transactional-email.js";
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

function parseCsvLower(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseCsvInt(raw: string | undefined): Set<number> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
}

function isTrialLike(planType: string): boolean {
  const p = planType.trim().toLowerCase();
  return p.startsWith("trial");
}

function isExpiredTrial(trialEndsAt: Date): boolean {
  return trialEndsAt.getTime() < Date.now();
}

/**
 * Limited-time promo blast.
 *
 * Audience rules (requested):
 * - Include: trial users, expired accounts, inactive users.
 * - Exclude: two active subscribers via env lists (`PROMO_OFFER_EXCLUDE_EMAILS`,
 *   `PROMO_OFFER_EXCLUDE_USER_IDS`, optional `PROMO_OFFER_EXCLUDE_PLAN_TYPES`).
 * - Idempotent: only users with `promo_offer_sent_at IS NULL`.
 *
 * Safety:
 * - Set `CONFIRM_PROMO_OFFER_SEND=1` to send.
 * - `PROMO_OFFER_DRY_RUN=1` prints counts only.
 */
export async function runSendPromoOfferNow(): Promise<void> {
  const dryRun = process.env.PROMO_OFFER_DRY_RUN === "1";

  if (!dryRun && process.env.CONFIRM_PROMO_OFFER_SEND !== "1") {
    const msg =
      "PROMO OFFER EMAIL: Refusing to send. Set CONFIRM_PROMO_OFFER_SEND=1 after reviewing template in transactional-email.ts (or PROMO_OFFER_DRY_RUN=1 to count recipients only).";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }

  if (!isPostgresEnvConfigured()) {
    const msg = "PROMO OFFER EMAIL: No database URL in env (set DATABASE_URL). Aborting.";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }
  if (!dryRun && !isResendConfigured()) {
    const msg = "PROMO OFFER EMAIL: RESEND_API_KEY not set. Aborting.";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }

  const excludedEmails = parseCsvLower(process.env.PROMO_OFFER_EXCLUDE_EMAILS);
  const excludedUserIds = parseCsvInt(process.env.PROMO_OFFER_EXCLUDE_USER_IDS);
  const excludedPlanTypes = parseCsvLower(process.env.PROMO_OFFER_EXCLUDE_PLAN_TYPES);

  const batchSize = parsePositiveInt(process.env.REMINDER_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const batchDelayMs = parsePositiveInt(process.env.REMINDER_BATCH_DELAY_MS, DEFAULT_BATCH_DELAY_MS);

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      isActive: usersTable.isActive,
      planType: usersTable.planType,
      trialEndsAt: usersTable.trialEndsAt,
    })
    .from(usersTable)
    .where(
      and(
        isNull(usersTable.promoOfferSentAt),
        isNotNull(usersTable.email),
        eq(usersTable.emailRemindersEnabled, true),
      ),
    );

  const selected = rows.filter((r) => {
    const email = (r.email ?? "").trim().toLowerCase();
    const plan = (r.planType ?? "").trim().toLowerCase();
    if (!email) return false;
    if (excludedUserIds.has(r.id)) return false;
    if (excludedEmails.has(email)) return false;
    if (excludedPlanTypes.has(plan)) return false;
    // Include trial / expired / inactive (requested campaign scope).
    if (!r.isActive) return true;
    if (isTrialLike(plan)) return true;
    if (isExpiredTrial(r.trialEndsAt)) return true;
    return false;
  });

  const pending = selected.length;
  let attempted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let skippedInvalidEmail = 0;

  logger.info(
    {
      campaign: "promo_offer",
      pending,
      batchSize,
      batchDelayMs,
      dryRun,
      excludedUserIds: [...excludedUserIds],
      excludedEmailsCount: excludedEmails.size,
      excludedPlanTypes: [...excludedPlanTypes],
    },
    "PROMO OFFER EMAIL: execution started",
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          campaign: "promo_offer",
          dryRun: true,
          pendingRecipients: pending,
          excludedUserIds: [...excludedUserIds],
          excludedEmails: [...excludedEmails],
          excludedPlanTypes: [...excludedPlanTypes],
          sampleRecipients: selected.slice(0, 25).map((r) => ({
            userId: r.id,
            email: r.email?.trim().toLowerCase() ?? null,
            isActive: r.isActive,
            planType: r.planType,
            trialEndsAt: r.trialEndsAt.toISOString(),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  for (let i = 0; i < selected.length; i += batchSize) {
    const batch = selected.slice(i, i + batchSize);
    logger.info(
      {
        campaign: "promo_offer",
        batchStart: i + 1,
        batchEnd: i + batch.length,
        total: pending,
      },
      "PROMO OFFER EMAIL: processing batch",
    );

    for (const row of batch) {
      const to = row.email?.trim().toLowerCase() ?? "";
      if (!to || !EMAIL_RE.test(to)) {
        skippedInvalidEmail++;
        logger.warn(
          { campaign: "promo_offer", userId: row.id, email: row.email },
          "PROMO OFFER EMAIL: skipped invalid email",
        );
        continue;
      }

      attempted++;
      const resendResult = await sendPromoOfferEmailWithResult(to, { userId: row.id });
      if (resendResult.ok) {
        await db
          .update(usersTable)
          .set({ promoOfferSentAt: new Date() })
          .where(eq(usersTable.id, row.id));
        emailsSent++;
        logger.info(
          {
            campaign: "promo_offer",
            userId: row.id,
            email: to,
            messageId: resendResult.messageId,
          },
          "PROMO OFFER EMAIL: sent",
        );
      } else {
        emailsFailed++;
        logger.error(
          {
            campaign: "promo_offer",
            userId: row.id,
            email: to,
            resendResult,
          },
          "PROMO OFFER EMAIL: send failed (user not marked sent — safe to retry)",
        );
      }
    }

    if (i + batchSize < selected.length) {
      await sleep(batchDelayMs);
    }
  }

  const summary = {
    campaign: "promo_offer",
    pendingRecipients: pending,
    attempted,
    emailsSent,
    emailsFailed,
    skippedInvalidEmail,
    batchSize,
    batchDelayMs,
  };
  logger.info(summary, "PROMO OFFER EMAIL: execution finished");
  console.log(JSON.stringify(summary, null, 2));

  if (attempted > 0 && emailsSent === 0 && emailsFailed > 0) {
    process.exitCode = 1;
  }
}

void runSendPromoOfferNow().catch((err) => {
  console.error("PROMO OFFER EMAIL: execution failed:", err instanceof Error ? err.message : err);
  logger.error({ err }, "PROMO OFFER EMAIL: execution failed");
  process.exitCode = 1;
});
