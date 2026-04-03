import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient.js";
import { db, pool, resolvedDatabaseUrl, sessionsTable, usersTable } from "@workspace/db";
import { isNull, sql, eq } from "drizzle-orm";
import { hashPassword } from "./lib/password.js";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { logAuthEnvBootstrap } from "./lib/authEnv.js";
import { logSessionAndDatabaseStartupStatus } from "./lib/sessionStartupDiagnostics.js";

const rawPort =
  process.env["PORT"] ?? process.env["RAILWAY_PORT"] ?? process.env["HTTP_PLATFORM_PORT"];
if (!rawPort) {
  throw new Error(
    "PORT is not set. On Railway, use a Web service (PORT is injected automatically).",
  );
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Schema migration on startup ───────────────────────────────────────────────
// Idempotent: adds any columns/tables that exist in the Drizzle schema but may
// be missing from an older production database.  Safe to run on every restart.
async function migrateSchema() {
  try {
    const client = await pool.connect();
    try {
      logger.info("Running startup schema migration…");

      // users table – columns added after initial release
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP`);

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

      logger.info("Startup schema migration complete");
    } catch (err) {
      logger.error({ err }, "Startup schema migration failed — continuing anyway");
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error(
      { err },
      "Could not connect to Postgres for startup migration — continuing (API may fail until DB is reachable)",
    );
  }
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

async function main() {
  logAuthEnvBootstrap();
  await migrateSchema();
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
  });
}

void main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
