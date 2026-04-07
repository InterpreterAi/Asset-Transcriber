import { db, usersTable } from "@workspace/db";
import { and, eq, gt, isNotNull, or, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendTrialAvailabilityReminderEmailWithResult } from "./transactional-email.js";
import { printTrialReminderDbReport } from "./trial-reminder-db-report.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function validateResendApiKeyNow(): Promise<{ ok: boolean; status?: number; detail?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { ok: false, detail: "RESEND_API_KEY missing" };
  }

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        detail: text.slice(0, 400) || "Resend /domains failed",
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Resend validation request failed",
    };
  }
}

/** Sends trial availability reminders. Set `SKIP_DB_PREVIEW=1` to skip the printed DB report first. */
export async function runSendTrialUsersReminderNow(): Promise<void> {
  const skipPreview = process.env.SKIP_DB_PREVIEW === "1" || process.env.SKIP_DB_PREVIEW === "true";

  if (!skipPreview) {
    await printTrialReminderDbReport();
    console.log("\n========== Sending reminder emails (blast selection) ==========\n");
  }

  logger.info("TRIAL USERS REMINDER NOW: start");

  if (!isResendConfigured()) {
    logger.error("TRIAL USERS REMINDER NOW: RESEND_API_KEY not configured; aborting.");
    return;
  }

  const resendValidation = await validateResendApiKeyNow();
  if (!resendValidation.ok) {
    logger.error(
      { resendValidation },
      "TRIAL USERS REMINDER NOW: Resend API key validation failed",
    );
  } else {
    logger.info(
      { status: resendValidation.status },
      "TRIAL USERS REMINDER NOW: Resend API key validation succeeded",
    );
  }
  console.log(
    JSON.stringify(
      { phase: "resend_domains_check", resendValidation },
      null,
      2,
    ),
  );

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      planType: usersTable.planType,
      subscriptionStatus: usersTable.subscriptionStatus,
      trialEndsAt: usersTable.trialEndsAt,
      trialStartedAt: usersTable.trialStartedAt,
      dailyLimitMinutes: usersTable.dailyLimitMinutes,
    })
    .from(usersTable)
    .where(
      and(
        or(eq(usersTable.planType, "trial"), eq(usersTable.subscriptionStatus, "trial")),
        isNotNull(usersTable.email),
        gt(usersTable.trialEndsAt, new Date(0)),
        sql`${usersTable.dailyLimitMinutes} > 0`,
      ),
    );

  const totalUsers = rows.length;
  let emailsSent = 0;
  let emailsFailed = 0;
  let skippedInvalidEmail = 0;

  const selectedPayload = rows.map((r) => ({
    userId: r.id,
    email:  r.email?.trim().toLowerCase() ?? null,
    planType: r.planType,
    subscriptionStatus: r.subscriptionStatus ?? null,
    trial_end_date: r.trialEndsAt.toISOString(),
    dailyLimitMinutes: r.dailyLimitMinutes,
  }));

  console.log(
    JSON.stringify(
      {
        phase: "selected_for_send",
        count: totalUsers,
        users: selectedPayload,
      },
      null,
      2,
    ),
  );
  logger.info(
    { totalUsers, selectedUserIds: rows.map((r) => r.id) },
    "TRIAL USERS REMINDER NOW: selected users for blast",
  );

  for (const row of rows) {
    const to = row.email?.trim().toLowerCase() ?? "";
    if (!to || !EMAIL_RE.test(to)) {
      skippedInvalidEmail++;
      console.log(
        JSON.stringify(
          {
            phase: "skip_invalid_email",
            userId: row.id,
            email: row.email,
          },
          null,
          2,
        ),
      );
      logger.warn({ userId: row.id, email: row.email }, "TRIAL USERS REMINDER NOW: skipped invalid email");
      continue;
    }

    const msLeft = row.trialEndsAt.getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

    console.log(
      JSON.stringify(
        {
          phase: "attempt_send",
          userId: row.id,
          to,
          daysRemaining,
        },
        null,
        2,
      ),
    );

    try {
      const resendResult = await sendTrialAvailabilityReminderEmailWithResult(to, {
        trialEndsAt: row.trialEndsAt,
        daysRemaining,
      });

      console.log(
        JSON.stringify(
          {
            phase: "resend_response",
            userId: row.id,
            to,
            resendResult,
          },
          null,
          2,
        ),
      );

      if (resendResult.ok) {
        emailsSent++;
        logger.info(
          { userId: row.id, email: to, sendStatus: "success", messageId: resendResult.messageId },
          "TRIAL USERS REMINDER NOW: email sent",
        );
      } else {
        emailsFailed++;
        logger.error(
          { userId: row.id, email: to, sendStatus: "failed", resendResult },
          "TRIAL USERS REMINDER NOW: email failed",
        );
      }
    } catch (err) {
      emailsFailed++;
      const exceptionMessage = err instanceof Error ? err.message : String(err);
      console.log(
        JSON.stringify(
          {
            phase: "resend_response",
            userId: row.id,
            to,
            resendResult: { ok: false, exceptionMessage },
          },
          null,
          2,
        ),
      );
      logger.error(
        {
          userId: row.id,
          email: to,
          sendStatus: "failed",
          errorMessage: exceptionMessage,
        },
        "TRIAL USERS REMINDER NOW: exception while sending email",
      );
    }
  }

  const summary = {
    total_users: totalUsers,
    emails_sent: emailsSent,
    emails_failed: emailsFailed,
    skipped_invalid_email: skippedInvalidEmail,
  };
  logger.info(summary, "TRIAL USERS REMINDER NOW: completed");
  console.log(JSON.stringify({ phase: "summary", ...summary }, null, 2));
}

void runSendTrialUsersReminderNow().catch((err) => {
  logger.error({ err }, "TRIAL USERS REMINDER NOW: execution crashed");
  process.exitCode = 1;
});
