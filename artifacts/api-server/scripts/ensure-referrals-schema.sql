-- Migrate legacy referrals click-tracking table to signup attribution schema.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS referrals (
  id               SERIAL PRIMARY KEY,
  referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending',
  sessions_count   INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_id_uidx
  ON referrals (referred_user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referrer_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referrer_user_id'
  ) THEN
    ALTER TABLE referrals RENAME TO referrals_legacy_click_tracking;
    CREATE TABLE referrals (
      id               SERIAL PRIMARY KEY,
      referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status           TEXT NOT NULL DEFAULT 'pending',
      sessions_count   INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMP NOT NULL DEFAULT NOW()
    );
    INSERT INTO referrals (referrer_user_id, referred_user_id, status, sessions_count, created_at)
    SELECT
      referrer_id,
      registered_user_id,
      CASE WHEN COALESCE(has_started_session, false) THEN 'active' ELSE 'pending' END,
      CASE WHEN COALESCE(has_started_session, false) THEN 1 ELSE 0 END,
      COALESCE(registered_at, created_at, NOW())
    FROM referrals_legacy_click_tracking
    WHERE registered_user_id IS NOT NULL
      AND referrer_id IS NOT NULL
      AND referrer_id <> registered_user_id;
    CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_id_uidx
      ON referrals (referred_user_id);
  END IF;
END $$;
