import { pgTable, serial, text, boolean, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(false),
  planType: text("plan_type").notNull().default("trial"),
  trialStartedAt: timestamp("trial_started_at").notNull().defaultNow(),
  trialEndsAt: timestamp("trial_ends_at").notNull(),
  /** Sent when trial end is within 48 hours (subject: ends in 2 days). */
  trialReminderSentAt: timestamp("trial_reminder_sent_at"),
  /** Sent when trial end is within 12 hours (subject: expires today). */
  trialReminder12hSentAt: timestamp("trial_reminder_12h_sent_at"),
  /** One-time "your trial is active" marketing email (trial-active-reminder job). */
  trialActiveReminderSentAt: timestamp("trial_active_reminder_sent_at"),
  /** One-time product email: translation architecture update (manual script; idempotent per user). */
  translationArchitectureUpdateEmailSentAt: timestamp("translation_architecture_update_email_sent_at"),
  /** One-time product email: stability / baseline announcement (manual script; idempotent per user). */
  stabilityBaselineUpdateEmailSentAt: timestamp("stability_baseline_update_email_sent_at"),
  /** When false, skip trial reminder campaign emails (unsubscribe). Other transactional mail unchanged. */
  emailRemindersEnabled: boolean("email_reminders_enabled").notNull().default(true),
  /** Email/password signups must verify before login; OAuth signups stay false. */
  requiresEmailVerification: boolean("requires_email_verification").notNull().default(false),
  gettingStartedEmailSentAt: timestamp("getting_started_email_sent_at"),
  trialExpiredEmailSentAt: timestamp("trial_expired_email_sent_at"),
  subscriptionConfirmationSentAt: timestamp("subscription_confirmation_sent_at"),
  subscriptionCanceledEmailSentAt: timestamp("subscription_canceled_email_sent_at"),
  /** Last Stripe invoice id we emailed as a payment receipt (avoid duplicates). */
  paymentReceiptLastInvoiceId: text("payment_receipt_last_invoice_id"),
  /** App-calendar date (`YYYY-MM-DD`, America/New_York) — last “daily limit reached” email (one per day). */
  dailyLimitReachedEmailAppDate: text("daily_limit_reached_email_app_date"),
  dailyLimitMinutes: integer("daily_limit_minutes").notNull().default(180),
  minutesUsedToday: real("minutes_used_today").notNull().default(0),
  totalMinutesUsed: real("total_minutes_used").notNull().default(0),
  totalSessions: integer("total_sessions").notNull().default(0),
  lastUsageResetAt: timestamp("last_usage_reset_at").notNull().defaultNow(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  defaultLangA: text("default_lang_a").notNull().default("en"),
  defaultLangB: text("default_lang_b").notNull().default("ar"),
  paypalSubscriptionId: text("paypal_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  subscriptionPlan: text("subscription_plan"),
  subscriptionStartedAt: timestamp("subscription_started_at"),
  /** Next renewal / end of current paid period (PayPal next_billing_time or start + 30 days). */
  subscriptionPeriodEndsAt: timestamp("subscription_period_ends_at"),
  googleAccountId: text("google_account_id").unique(),
  lastActivity: timestamp("last_activity"),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emailVerificationTokensTable = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
export type EmailVerificationToken = typeof emailVerificationTokensTable.$inferSelect;
