import { randomBytes } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  sessionsTable,
  passwordResetTokensTable,
  emailVerificationTokensTable,
  trialConsumedEmailsTable,
  type User,
} from "@workspace/db";
import { logger } from "./logger.js";
import { cancelPayPalSubscription } from "./paypal-cancel.js";
import { getUncachableStripeClient } from "./stripeClient.js";

export type DeactivateUserAccountResult = {
  paypalCancelled: boolean;
  stripeCancelled: boolean;
  softDeleted: boolean;
};

export type DeactivateUserAccountOptions = {
  /** When true (legacy admin hard purge), remove user row entirely. Default: soft-delete (keep row). */
  hardDelete?: boolean;
  /** Only used with hardDelete — allow email to sign up for trial again. */
  purgeTrialConsumedEmail?: boolean;
};

function subscriptionLooksBillable(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return false;
  return !["inactive", "cancelled", "canceled", "expired"].includes(s);
}

async function cancelExternalBilling(user: User): Promise<{ paypalCancelled: boolean; stripeCancelled: boolean }> {
  let paypalCancelled = false;
  let stripeCancelled = false;

  const paypalId = user.paypalSubscriptionId?.trim();
  if (paypalId && subscriptionLooksBillable(user.subscriptionStatus)) {
    try {
      paypalCancelled = await cancelPayPalSubscription(paypalId, "Account closed");
    } catch (err) {
      logger.error({ err, userId: user.id, paypalId }, "deactivateUserAccount: PayPal cancel failed");
      throw err;
    }
  }

  const stripeSubId = user.stripeSubscriptionId?.trim();
  if (stripeSubId && process.env.STRIPE_SECRET_KEY?.trim()) {
    try {
      const stripe = await getUncachableStripeClient();
      await stripe.subscriptions.cancel(stripeSubId);
      stripeCancelled = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/no such subscription|already been canceled|already cancelled/i.test(msg)) {
        stripeCancelled = true;
      } else {
        logger.error({ err, userId: user.id, stripeSubId }, "deactivateUserAccount: Stripe cancel failed");
        throw err;
      }
    }
  }

  return { paypalCancelled, stripeCancelled };
}

async function closeOpenTranscriptionSessions(userId: number): Promise<void> {
  const now = new Date();
  await db
    .update(sessionsTable)
    .set({ endedAt: now, lastActivityAt: now })
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.endedAt)));
}

async function purgeAuthSessions(userId: number): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM user_sessions WHERE (sess::jsonb->>'userId')::int = ${userId}`,
    );
  } catch (err) {
    logger.warn({ err, userId }, "deactivateUserAccount: user_sessions purge failed (table may be absent)");
  }
}

async function recordTrialConsumedEmail(email: string | null): Promise<void> {
  const em = email?.trim().toLowerCase();
  if (!em) return;
  try {
    await db
      .insert(trialConsumedEmailsTable)
      .values({ email: em })
      .onConflictDoNothing({ target: trialConsumedEmailsTable.email });
  } catch (err) {
    logger.warn({ err, email: em }, "deactivateUserAccount: trial_consumed_emails insert failed");
  }
}

async function softDeactivateUser(user: User): Promise<void> {
  const now = new Date();
  const tombstoneSecret = `$deleted$${randomBytes(24).toString("hex")}`;

  await db
    .update(usersTable)
    .set({
      isActive: false,
      accountDeletedAt: user.accountDeletedAt ?? now,
      passwordHash: tombstoneSecret,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      googleAccountId: null,
      subscriptionStatus: "inactive",
      paypalSubscriptionId: null,
      stripeSubscriptionId: null,
    })
    .where(eq(usersTable.id, user.id));

  await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, user.id));
  await db.delete(emailVerificationTokensTable).where(eq(emailVerificationTokensTable.userId, user.id));
}

/** Block new trial signups for emails that already consumed a trial or closed an account. */
export async function emailBlockedFromNewSignup(email: string): Promise<boolean> {
  const em = email.trim().toLowerCase();
  if (!em) return false;

  const [consumed] = await db
    .select({ email: trialConsumedEmailsTable.email })
    .from(trialConsumedEmailsTable)
    .where(eq(trialConsumedEmailsTable.email, em))
    .limit(1);
  if (consumed) return true;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.email, em), eq(usersTable.username, em)))
    .limit(1);
  return Boolean(existing);
}

/**
 * Close account: user row stays in admin for audit/bans; login and trial reuse blocked.
 * Cancels PayPal/Stripe when still billable.
 */
export async function deactivateUserAccount(
  userId: number,
  options: DeactivateUserAccountOptions = {},
): Promise<DeactivateUserAccountResult> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (user.accountDeletedAt && !user.isActive && !options.hardDelete) {
    return { paypalCancelled: false, stripeCancelled: false, softDeleted: true };
  }

  const billing = await cancelExternalBilling(user);
  await closeOpenTranscriptionSessions(userId);

  const em = user.email?.trim().toLowerCase() ?? user.username.trim().toLowerCase();
  await recordTrialConsumedEmail(em);

  if (options.hardDelete) {
    if (options.purgeTrialConsumedEmail && em) {
      await db.delete(trialConsumedEmailsTable).where(eq(trialConsumedEmailsTable.email, em));
    }
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  } else {
    await softDeactivateUser(user);
  }

  await purgeAuthSessions(userId);

  logger.info(
    {
      userId,
      email: user.email,
      hardDelete: Boolean(options.hardDelete),
      paypalCancelled: billing.paypalCancelled,
      stripeCancelled: billing.stripeCancelled,
    },
    options.hardDelete ? "User account hard-deleted" : "User account soft-deleted (admin row retained)",
  );

  return {
    ...billing,
    softDeleted: !options.hardDelete,
  };
}

/** @deprecated Use deactivateUserAccount — kept as alias for imports. */
export async function eraseUserAccount(
  userId: number,
  options: { purgeTrialConsumedEmail?: boolean } = {},
): Promise<{ paypalCancelled: boolean; stripeCancelled: boolean }> {
  const r = await deactivateUserAccount(userId, {
    hardDelete: false,
    purgeTrialConsumedEmail: options.purgeTrialConsumedEmail,
  });
  return { paypalCancelled: r.paypalCancelled, stripeCancelled: r.stripeCancelled };
}
