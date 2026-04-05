import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient.js";
import { db, pool, resolvedDatabaseUrl, sessionsTable, usersTable } from "@workspace/db";
import { isNull, sql, eq } from "drizzle-orm";
import { hashPassword } from "./lib/password.js";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { logAuthEnvBootstrap } from "./lib/authEnv.js";
import { logSessionAndDatabaseStartupStatus } from "./lib/sessionStartupDiagnostics.js";
import { TRIAL_DAILY_LIMIT_MINUTES } from "./lib/trial-constants.js";
import { scheduleTrialReminderJob } from "./lib/trial-reminder-job.js";
import { scheduleOnboardingEmailJob } from "./lib/onboarding-email-job.js";

const rawPort =
  process.env["PORT"] ??
  process.env["RAILWAY_PORT"] ??
  process.env["HTTP_PLATFORM_PORT"] ??
  (process.env.NODE_ENV !== "production" ? "8787" : undefined);
if (!rawPort) {
  throw new Error(
    "PORT is not set. On Railway, use a Web service (PORT is injected automatically). " +
      "For local dev, omit NODE_ENV=production or set PORT (default 8787 in development).",
  );
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Schema migration on startup ───────────────────────────────────────────────
// Idempotent: adds any columns/tables that exist in the Drizzle schema but may
// be missing from an older production database.  Safe to run on every restart.
// On failure we throw (no silent "continuing anyway") so Railway logs show the real SQL error.
async function migrateSchema() {
  const client = await pool.connect();
  try {
    logger.info("Running startup schema migration…");
    await client.query("BEGIN");

    try {
      // ── Core tables (Drizzle schema) — required on a fresh Railway Postgres. ──
      // This app does not use Prisma; schema is applied here on every boot (idempotent).
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id                     SERIAL PRIMARY KEY,
          username               TEXT NOT NULL UNIQUE,
          email                  TEXT UNIQUE,
          password_hash          TEXT NOT NULL,
          is_admin               BOOLEAN NOT NULL DEFAULT FALSE,
          is_active              BOOLEAN NOT NULL DEFAULT TRUE,
          email_verified         BOOLEAN NOT NULL DEFAULT FALSE,
          plan_type              TEXT NOT NULL DEFAULT 'trial',
          trial_started_at       TIMESTAMP NOT NULL DEFAULT NOW(),
          trial_ends_at          TIMESTAMP NOT NULL,
          daily_limit_minutes    INTEGER NOT NULL DEFAULT 180,
          minutes_used_today     REAL NOT NULL DEFAULT 0,
          total_minutes_used     REAL NOT NULL DEFAULT 0,
          total_sessions         INTEGER NOT NULL DEFAULT 0,
          last_usage_reset_at    TIMESTAMP NOT NULL DEFAULT NOW(),
          stripe_customer_id     TEXT,
          stripe_subscription_id TEXT,
          google_account_id      TEXT UNIQUE,
          last_activity          TIMESTAMP,
          two_factor_secret      TEXT,
          two_factor_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
          trial_reminder_sent_at TIMESTAMP,
          created_at             TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id         SERIAL PRIMARY KEY,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token      TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          used_at    TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
          id         SERIAL PRIMARY KEY,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token      TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id)`,
      );
      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id                       SERIAL PRIMARY KEY,
          user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          started_at               TIMESTAMP NOT NULL DEFAULT NOW(),
          ended_at                 TIMESTAMP,
          duration_seconds         INTEGER,
          last_activity_at         TIMESTAMP,
          lang_pair                TEXT,
          audio_seconds_processed  INTEGER DEFAULT 0,
          soniox_cost              NUMERIC(10, 6) DEFAULT 0,
          translation_tokens       INTEGER DEFAULT 0,
          translation_cost         NUMERIC(10, 6) DEFAULT 0,
          total_session_cost       NUMERIC(10, 6) DEFAULT 0
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS feedback (
          id         SERIAL PRIMARY KEY,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rating     INTEGER NOT NULL,
          recommend  TEXT,
          comment    TEXT,
          source     TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS email TEXT`);

      // users table – columns added after initial release
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMP`);
      await client.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_email_verification BOOLEAN NOT NULL DEFAULT FALSE`,
      );
      await client.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS getting_started_email_sent_at TIMESTAMP`,
      );
      await client.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_expired_email_sent_at TIMESTAMP`,
      );
      await client.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_confirmation_sent_at TIMESTAMP`,
      );
      await client.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_reminder_12h_sent_at TIMESTAMP`,
      );
      await client.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_canceled_email_sent_at TIMESTAMP`,
      );
      await client.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_receipt_last_invoice_id TEXT`,
      );

      await client.query(`
        CREATE TABLE IF NOT EXISTS trial_consumed_emails (
          email      TEXT PRIMARY KEY,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      // Emails that already have (or had) an account — blocks a second free trial on re-signup.
      // New signups also insert here in the auth transaction after the user row is created.
      await client.query(`
        INSERT INTO trial_consumed_emails (email)
        SELECT DISTINCT lower(trim(email))
        FROM users
        WHERE email IS NOT NULL AND trim(email) <> ''
        ON CONFLICT (email) DO NOTHING
      `);

      // sessions table – columns added after initial release
      await client.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lang_pair TEXT`);

      // Tables that may not exist in older databases
      await client.query(`
      CREATE TABLE IF NOT EXISTS glossary_entries (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        term        TEXT NOT NULL,
        translation TEXT NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
      await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        email      TEXT NOT NULL,
        subject    TEXT NOT NULL,
        message    TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
      await client.query(`
      CREATE TABLE IF NOT EXISTS support_replies (
        id         SERIAL PRIMARY KEY,
        ticket_id  INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_admin   BOOLEAN NOT NULL DEFAULT FALSE,
        message    TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
      await client.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
        session_id    TEXT,
        endpoint      TEXT NOT NULL,
        method        TEXT NOT NULL DEFAULT 'GET',
        status_code   INTEGER NOT NULL,
        error_type    TEXT NOT NULL,
        error_message TEXT,
        user_agent    TEXT,
        ip_address    TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
      await client.query(`
      CREATE TABLE IF NOT EXISTS login_events (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
        email          TEXT,
        ip_address     TEXT,
        user_agent     TEXT,
        success        BOOLEAN NOT NULL,
        failure_reason TEXT,
        is_2fa         BOOLEAN NOT NULL DEFAULT FALSE,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

      await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id                  SERIAL PRIMARY KEY,
        referrer_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        clicked_at          TIMESTAMP NOT NULL DEFAULT NOW(),
        registered_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        registered_at       TIMESTAMP,
        has_started_session BOOLEAN NOT NULL DEFAULT FALSE,
        created_at          TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

      // Session store table — connect-pg-simple; middleware also uses createTableIfMissing as fallback.
      await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid    VARCHAR NOT NULL COLLATE "default",
        sess   JSON    NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
      )
    `);
      await client.query(`
      CREATE INDEX IF NOT EXISTS idx_session_expire ON user_sessions (expire)
    `);

      await client.query(`
      CREATE TABLE IF NOT EXISTS share_events (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform   TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
      await client.query(`
      CREATE INDEX IF NOT EXISTS idx_share_events_user ON share_events (user_id)
    `);

      await client.query(
        `ALTER TABLE users ALTER COLUMN daily_limit_minutes SET DEFAULT ${TRIAL_DAILY_LIMIT_MINUTES}`,
      );

      await client.query("COMMIT");
      logger.info("Startup schema migration complete");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      const code = (err as { code?: string })?.code;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[FATAL] Startup schema migration failed:", msg, code ? `(pg ${code})` : "");
      console.error(err);
      logger.error({ err, pgCode: code }, "Startup schema migration failed");
      throw err;
    }
  } finally {
    client.release();
  }
}

/** Refuse to serve if Postgres or core tables are unusable — avoids opaque HTTP 500 on every /api/auth call. */
async function requireDatabaseReadyForApi(): Promise<void> {
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    console.error("[FATAL] Postgres not reachable (SELECT 1 failed). Check DATABASE_URL on this Railway service.");
    console.error(err);
    throw err;
  }
  const usersReg = await pool.query<{ r: string | null }>(
    `SELECT to_regclass('public.users') AS r`,
  );
  const sessionsReg = await pool.query<{ r: string | null }>(
    `SELECT to_regclass('public.sessions') AS r`,
  );
  if (!usersReg.rows[0]?.r || !sessionsReg.rows[0]?.r) {
    const msg =
      "Core tables missing after migration: public.users and/or public.sessions. " +
      "See earlier [FATAL] migrate logs for the SQL error.";
    console.error(`[FATAL] ${msg}`);
    throw new Error(msg);
  }
  try {
    await pool.query("SELECT id FROM users LIMIT 1");
  } catch (err) {
    console.error(
      "[FATAL] public.users exists but is not readable — wrong schema, RLS, or permissions?",
    );
    console.error(err);
    throw err;
  }
  logger.info("Startup: database readiness check passed (users + sessions)");
}

// ── Stale session cleanup on startup ─────────────────────────────────────────
async function clearStaleSessions() {
  try {
    const result = await db
      .update(sessionsTable)
      .set({ endedAt: new Date() })
      .where(
        sql`${sessionsTable.endedAt} IS NULL
            AND COALESCE(${sessionsTable.lastActivityAt}, ${sessionsTable.startedAt})
                < NOW() - INTERVAL '60 seconds'`
      )
      .returning({ id: sessionsTable.id });

    if (result.length > 0) {
      logger.info({ count: result.length }, "Closed stale sessions on startup");
    }
  } catch (err) {
    logger.error({ err }, "Failed to clear stale sessions on startup");
  }
}

// ── Stripe initialization (graceful — server still starts if Stripe not connected) ──
async function initStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.warn("STRIPE_SECRET_KEY not set; Stripe features disabled until integration is connected");
    return;
  }

  try {
    logger.info("Initializing Stripe schema…");
    await runMigrations({ databaseUrl: resolvedDatabaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost"}`;
    const webhook = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`
    );
    logger.info({ webhookUrl: webhook.url }, "Stripe webhook configured");

    stripeSync.syncBackfill()
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err) => logger.error({ err }, "Stripe backfill error"));
  } catch (err) {
    logger.error({ err }, "Stripe init failed — Stripe features will be unavailable");
  }
}

// ── Ensure at least one admin exists; apply ADMIN_PASSWORD to every admin row ─
// If any isAdmin user exists but none have username "admin", the old logic never
// synced ADMIN_PASSWORD — password login then fails. When ADMIN_PASSWORD is set,
// we update password_hash for ALL is_admin users on each boot (Railway recovery).
async function ensureAdminUser() {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@interpreterai.com").trim().toLowerCase();

    const adminRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.isAdmin, true));

    if (adminRows.length === 0) {
      if (!adminPassword) {
        logger.warn(
          "No user with isAdmin=true and ADMIN_PASSWORD is unset; cannot bootstrap admin. " +
            "Set ADMIN_PASSWORD on the running Railway service and redeploy.",
        );
        return;
      }
      const passwordHash = await hashPassword(adminPassword);
      const now = new Date();
      await db.insert(usersTable).values({
        username: "admin",
        email: adminEmail,
        passwordHash,
        isAdmin: true,
        isActive: true,
        emailVerified: true,
        planType: "unlimited",
        trialStartedAt: now,
        trialEndsAt: new Date("2099-12-31"),
        dailyLimitMinutes: 9999,
        minutesUsedToday: 0,
        totalMinutesUsed: 0,
        totalSessions: 0,
        lastUsageResetAt: now,
      });
      logger.info({ email: adminEmail }, "Admin user created (no admin existed)");
      return;
    }

    if (adminPassword) {
      const passwordHash = await hashPassword(adminPassword);
      const updated = await db
        .update(usersTable)
        .set({
          passwordHash,
          isActive: true,
          planType: "unlimited",
          dailyLimitMinutes: 9999,
          trialEndsAt: new Date("2099-12-31"),
        })
        .where(eq(usersTable.isAdmin, true))
        .returning({ id: usersTable.id });
      logger.info(
        { updatedAdminCount: updated.length },
        "ADMIN_PASSWORD applied to all isAdmin users (use this Railway secret as the login password)",
      );
      return;
    }

    // No ADMIN_PASSWORD: still normalize plan for legacy row username=admin if present.
    const [named] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, "admin"))
      .limit(1);
    if (!named) return;

    if (named.planType !== "unlimited" || named.dailyLimitMinutes < 9999) {
      await db
        .update(usersTable)
        .set({
          planType: "unlimited",
          dailyLimitMinutes: 9999,
          trialEndsAt: new Date("2099-12-31"),
          isAdmin: true,
          isActive: true,
        })
        .where(eq(usersTable.username, "admin"));
      logger.info("Admin user upgraded to unlimited plan (no ADMIN_PASSWORD in env)");
    }
  } catch (err) {
    logger.error({ err }, "Failed to ensure admin user");
  }
}

/** Active trials (14-day window not expired) use the current trial daily cap — keeps existing users in sync with signup defaults. */
async function syncActiveTrialDailyLimits(): Promise<void> {
  const r = await pool.query(
    `UPDATE users SET daily_limit_minutes = $1 WHERE plan_type = 'trial' AND trial_ends_at > NOW()`,
    [TRIAL_DAILY_LIMIT_MINUTES],
  );
  const n = r.rowCount ?? 0;
  if (n > 0) {
    logger.info({ updatedRows: n }, "Applied TRIAL_DAILY_LIMIT_MINUTES to active trial users");
  }
}

async function main() {
  logAuthEnvBootstrap();
  await migrateSchema();
  await requireDatabaseReadyForApi();
  await syncActiveTrialDailyLimits();
  await logSessionAndDatabaseStartupStatus();
  await clearStaleSessions();
  await ensureAdminUser();
  await initStripe();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    scheduleTrialReminderJob();
    scheduleOnboardingEmailJob();
  });
}

void main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
