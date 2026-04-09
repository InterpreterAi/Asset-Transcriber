-- One-time: required for `email:send-stability-baseline-update-now`
-- Run in Railway / Neon / psql against your production DB (safe to run once; no-op if column exists).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'stability_baseline_update_email_sent_at'
  ) THEN
    ALTER TABLE users
      ADD COLUMN stability_baseline_update_email_sent_at timestamp;
  END IF;
END $$;
