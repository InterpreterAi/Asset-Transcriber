import "../env-bootstrap.js";
import { db, usersTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { appCalendarDateAndHour } from "@workspace/app-timezone";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendDailyLimitReachedEmail } from "./transactional-email.js";
import { isPostgresEnvConfigured } from "../postgres-env.js";
import { UNLIMITED_DAILY_CAP_MINUTES } from "./feedback-gate.js";

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
 * One-time (or occasional): email users who are **already** at or over today's daily cap so they
 * recognize the automated message. Sets `daily_limit_reached_email_app_date` on success (same as
 * session-stop flow) so they won't get a duplicate the same app day.
 *
 * Prerequisites: DATABASE_URL, RESEND_API_KEY.
 *
 * CONFIRM_DAILY_LIMIT_CATCH_UP=1 required to send.
 * DAILY_LIMIT_CATCH_UP_DRY_RUN=1 counts eligible users only (no Resend needed).
 */
export async function runSendDailyLimitCatchUpNow(): Promise<void> {
  const dryRun = process.env.DAILY_LIMIT_CATCH_UP_DRY_RUN === "1";

  if (!dryRun && process.env.CONFIRM_DAILY_LIMIT_CATCH_UP !== "1") {
    const msg =
      "DAILY LIMIT CATCH-UP: Refusing to send. Set CONFIRM_DAILY_LIMIT_CATCH_UP=1 (or DAILY_LIMIT_CATCH_UP_DRY_RUN=1 to count only).";
    console.error(msg);
    logger.error(msg);
    process.exitCode = 1;
    return;
  }

  if (!isPostgresEnvConfigured()) {
    console.error("DAILY LIMIT CATCH-UP: DATABASE_URL not set.");
    logger.error("DAILY LIMIT CATCH-UP: DATABASE_URL not set.");
    process.exitCode = 1;
    return;
  }
  if (!dryRun && !isResendConfigured()) {
    console.error("DAILY LIMIT CATCH-UP: RESEND_API_KEY not set.");
    logger.error("DAILY LIMIT CATCH-UP: RESEND_API_KEY not set.");
    process.exitCode = 1;
    return;
  }

  const batchSize = parsePositiveInt(process.env.REMINDER_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const batchDelayMs = parsePositiveInt(process.env.REMINDER_BATCH_DELAY_MS, DEFAULT_BATCH_DELAY_MS);
  const todayIso = appCalendarDateAndHour().dateIso;

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      dailyLimitMinutes: usersTable.dailyLimitMinutes,
      minutesUsedToday: usersTable.minutesUsedToday,
      dailyLimitReachedEmailAppDate: usersTable.dailyLimitReachedEmailAppDate,
      emailRemindersEnabled: usersTable.emailRemindersEnabled,
    })
    .from(usersTable)
    .where(isNotNull(usersTable.email));

  const eligible = rows.filter((r) => {
    if (r.emailRemindersEnabled === false) return false;
    const cap = Number(r.dailyLimitMinutes);
    const used = Number(r.minutesUsedToday);
    if (!Number.isFinite(cap) || cap <= 0 || cap >= UNLIMITED_DAILY_CAP_MINUTES) return false;
    if (!Number.isFinite(used) || used + 1e-6 < cap) return false;
    if (r.dailyLimitReachedEmailAppDate === todayIso) return false;
    const to = r.email?.trim().toLowerCase() ?? "";
    return to.length > 0 && EMAIL_RE.test(to);
  });

  logger.info(
    {
      campaign: "daily_limit_catch_up",
      eligible: eligible.length,
      dryRun,
      todayIso,
    },
    "DAILY LIMIT CATCH-UP: started",
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          campaign: "daily_limit_catch_up",
          dryRun: true,
          todayIso,
          eligibleRecipients: eligible.length,
          userIds: eligible.map((e) => e.id),
        },
        null,
        2,
      ),
    );
    return;
  }

  let attempted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;

  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);
    for (const row of batch) {
      const to = row.email!.trim().toLowerCase();
      attempted++;
      try {
        const ok = await sendDailyLimitReachedEmail(to, row.username, row.id, {
          dailyLimitMinutes: Number(row.dailyLimitMinutes),
          catchUpNotice: true,
        });
        if (ok) {
          await db
            .update(usersTable)
            .set({ dailyLimitReachedEmailAppDate: todayIso })
            .where(eq(usersTable.id, row.id));
          emailsSent++;
          logger.info({ userId: row.id, email: to }, "DAILY LIMIT CATCH-UP: sent");
        } else {
          emailsFailed++;
          logger.warn({ userId: row.id, email: to }, "DAILY LIMIT CATCH-UP: send returned false");
        }
      } catch (err) {
        emailsFailed++;
        logger.error({ err, userId: row.id }, "DAILY LIMIT CATCH-UP: send failed");
      }
    }
    if (i + batchSize < eligible.length) await sleep(batchDelayMs);
  }

  const summary = {
    campaign: "daily_limit_catch_up",
    todayIso,
    eligible: eligible.length,
    attempted,
    emailsSent,
    emailsFailed,
  };
  console.log(JSON.stringify(summary, null, 2));
  logger.info(summary, "DAILY LIMIT CATCH-UP: finished");

  if (attempted > 0 && emailsSent === 0 && emailsFailed > 0) {
    process.exitCode = 1;
  }
}

void runSendDailyLimitCatchUpNow().catch((err) => {
  console.error("DAILY LIMIT CATCH-UP:", err instanceof Error ? err.message : err);
  logger.error({ err }, "DAILY LIMIT CATCH-UP failed");
  process.exitCode = 1;
});
