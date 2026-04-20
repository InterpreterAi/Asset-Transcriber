-- One-time: required for `email:send-promo-offer`
-- Run in Railway / Neon / psql against your production DB (safe to run once; no-op if column exists).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'promo_offer_sent_at'
  ) THEN
    ALTER TABLE users
      ADD COLUMN promo_offer_sent_at timestamp;
  END IF;
END $$;
