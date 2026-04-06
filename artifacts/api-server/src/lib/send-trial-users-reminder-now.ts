import { db, usersTable } from "@workspace/db";
import { and, eq, gt, isNotNull, or, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendTrialAvailabilityReminderEmail } from "./transactional-email.js";

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

export async function runSendTrialUsersReminderNow(): Promise<void> {
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

  console.log(`Found ${totalUsers} users`);
  console.log("Sending reminder emails...");
  logger.info(
    {
      totalUsers,
    },
    "TRIAL USERS REMINDER NOW: selected users loaded",
  );

  for (const row of rows) {
    const to = row.email?.trim().toLowerCase() ?? "";
    if (!to || !EMAIL_RE.test(to)) {
      skippedInvalidEmail++;
      logger.warn({ userId: row.id, email: row.email }, "TRIAL USERS REMINDER NOW: skipped invalid email");
      continue;
    }

    const msLeft = row.trialEndsAt.getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

    try {
      const ok = await sendTrialAvailabilityReminderEmail(to, {
        trialEndsAt: row.trialEndsAt,
        daysRemaining,
      });
      if (ok) {
        emailsSent++;
        console.log(`Email sent to ${to}`);
        logger.info({ userId: row.id, email: to, sendStatus: "success" }, "TRIAL USERS REMINDER NOW: email sent");
      } else {
        emailsFailed++;
        logger.error({ userId: row.id, email: to, sendStatus: "failed" }, "TRIAL USERS REMINDER NOW: email failed");
      }
    } catch (err) {
      emailsFailed++;
      logger.error(
        {
          userId: row.id,
          email: to,
          sendStatus: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
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
  console.log(JSON.stringify(summary, null, 2));
}

void runSendTrialUsersReminderNow().catch((err) => {
  logger.error({ err }, "TRIAL USERS REMINDER NOW: execution crashed");
  process.exitCode = 1;
});
