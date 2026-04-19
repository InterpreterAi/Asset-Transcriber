/**
 * One-off: send "Your InterpreterAI subscription is active" to a user by email.
 * Usage: pnpm exec tsx ./src/lib/send-subscription-confirmation-now.ts user@example.com
 *
 * Requires DATABASE_URL*, RESEND_API_KEY, and same env as the API (*or Drizzle connection from @workspace/db).
 */
import "../env-bootstrap.js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { isResendConfigured } from "./resend-mail.js";
import { sendSubscriptionConfirmationEmail } from "./transactional-email.js";
import { billingPlanTierDisplayName, billingProductKeyFromPlanType } from "./paypal.js";
import { isPostgresEnvConfigured } from "../postgres-env.js";

const emailArg =
  process.argv
    .slice(2)
    .find((a) => a.includes("@") && !a.startsWith("-"))
    ?.trim()
    .toLowerCase() ?? "";

async function main(): Promise<void> {
  if (!emailArg || !emailArg.includes("@")) {
    console.error("Usage: tsx ./src/lib/send-subscription-confirmation-now.ts <email>");
    process.exitCode = 1;
    return;
  }
  if (!isPostgresEnvConfigured()) {
    logger.error("DATABASE not configured; set DATABASE_URL (or project postgres env).");
    process.exitCode = 1;
    return;
  }
  if (!isResendConfigured()) {
    logger.error("RESEND_API_KEY not configured.");
    process.exitCode = 1;
    return;
  }

  const [u] = await db.select().from(usersTable).where(eq(usersTable.email, emailArg)).limit(1);
  if (!u) {
    logger.error({ email: emailArg }, "User not found");
    process.exitCode = 1;
    return;
  }

  const key = billingProductKeyFromPlanType(u.planType ?? "");
  if (!key) {
    logger.error({ email: emailArg, planType: u.planType }, "User plan does not map to a paid tier");
    process.exitCode = 1;
    return;
  }

  const planName = billingPlanTierDisplayName(key);
  const ok = await sendSubscriptionConfirmationEmail(
    emailArg,
    planName,
    "Your next billing date is available in your PayPal account",
    u.username,
    u.id,
  );

  if (!ok) {
    logger.error({ email: emailArg }, "sendSubscriptionConfirmationEmail returned false");
    process.exitCode = 1;
    return;
  }

  await db
    .update(usersTable)
    .set({ subscriptionConfirmationSentAt: new Date() })
    .where(eq(usersTable.id, u.id));

  logger.info({ email: emailArg, userId: u.id, planName }, "Subscription confirmation email sent");
  console.log(JSON.stringify({ ok: true, email: emailArg, userId: u.id, planName }, null, 2));
}

void main().catch((err) => {
  logger.error({ err }, "send-subscription-confirmation-now failed");
  process.exitCode = 1;
});
