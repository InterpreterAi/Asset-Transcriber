-- Idempotent: add any users.* columns missing vs lib/db/src/schema/users.ts
-- Run in Railway → Postgres → Query, or: railway connect postgres then \i this file
-- Safe to re-run. Requires PostgreSQL 11+ (ADD COLUMN IF NOT EXISTS).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS trial_reminder_12h_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS trial_active_reminder_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS translation_architecture_update_email_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS stability_baseline_update_email_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS email_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_email_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS getting_started_email_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS trial_expired_email_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS subscription_confirmation_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS subscription_canceled_email_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS payment_receipt_last_invoice_id text,
  ADD COLUMN IF NOT EXISTS daily_limit_reached_email_app_date text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS default_lang_a text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS default_lang_b text NOT NULL DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS paypal_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS subscription_plan text,
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamp,
  ADD COLUMN IF NOT EXISTS subscription_period_ends_at timestamp,
  ADD COLUMN IF NOT EXISTS google_account_id text,
  ADD COLUMN IF NOT EXISTS last_activity timestamp,
  ADD COLUMN IF NOT EXISTS two_factor_secret text,
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;

-- These may already exist on older DBs with different definitions; IF NOT EXISTS skips.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS daily_limit_minutes integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS minutes_used_today real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_minutes_used real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_usage_reset_at timestamp NOT NULL DEFAULT now();

-- trial_ends_at: required for app logic; only added if somehow missing
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamp NOT NULL DEFAULT (now() + interval '7 days');
