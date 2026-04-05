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
  /** Set when the "2 days before trial end" reminder email has been sent (Resend). */
  trialReminderSentAt: timestamp("trial_reminder_sent_at"),
  /** Email/password signups must verify before login; OAuth signups stay false. */
  requiresEmailVerification: boolean("requires_email_verification").notNull().default(false),
  gettingStartedEmailSentAt: timestamp("getting_started_email_sent_at"),
  trialExpiredEmailSentAt: timestamp("trial_expired_email_sent_at"),
  subscriptionConfirmationSentAt: timestamp("subscription_confirmation_sent_at"),
  dailyLimitMinutes: integer("daily_limit_minutes").notNull().default(180),
  minutesUsedToday: real("minutes_used_today").notNull().default(0),
  totalMinutesUsed: real("total_minutes_used").notNull().default(0),
  totalSessions: integer("total_sessions").notNull().default(0),
  lastUsageResetAt: timestamp("last_usage_reset_at").notNull().defaultNow(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
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
