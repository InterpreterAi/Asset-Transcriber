import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient.js";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { isNull, sql, eq } from "drizzle-orm";
import { hashPassword } from "./lib/password.js";
import app from "./app.js";
import { logger } from "./lib/logger.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Stale session cleanup on startup ─────────────────────────────────────────
// When the server restarts any previously open sessions are left with no
// endedAt and no heartbeat, so they would block the user from starting a new
// one for 60 s.  We proactively close them all so the first Start press works.
async function clearStaleSessions() {
  try {
    const result = await db
      .update(sessionsTable)
      .set({ endedAt: new Date() })
      .where(
        // Open sessions whose last heartbeat (or startedAt) is ≥60 s ago.
        // We use a raw SQL expression so COALESCE works across both old rows
        // (no lastActivityAt) and new rows.
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
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set; skipping Stripe init");
    return;
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.warn("STRIPE_SECRET_KEY not set; Stripe features disabled until integration is connected");
    return;
  }

  try {
    logger.info("Initializing Stripe schema…");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost"}`;
    const { webhook } = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`
    );
    logger.info({ webhookUrl: webhook?.url }, "Stripe webhook configured");

    // Run backfill asynchronously so server starts fast
    stripeSync.syncBackfill()
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err) => logger.error({ err }, "Stripe backfill error"));
  } catch (err) {
    logger.error({ err }, "Stripe init failed — Stripe features will be unavailable");
  }
}

// ── Ensure admin user exists ──────────────────────────────────────────────────
// Creates the default admin account if it doesn't exist (e.g. fresh production DB).
async function ensureAdminUser() {
  try {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, "admin"))
      .limit(1);

    if (existing.length === 0) {
      const passwordHash = await hashPassword("admin123");
      const now = new Date();
      await db.insert(usersTable).values({
        username: "admin",
        email: "admin@interpreterai.com",
        passwordHash,
        isAdmin: true,
        isActive: true,
        planType: "unlimited",
        trialStartedAt: now,
        trialEndsAt: new Date("2099-12-31"),
        dailyLimitMinutes: 9999,
        lastUsageResetAt: now,
      });
      logger.info("Admin user created (first boot)");
    } else {
      // Always ensure the admin account stays on the unlimited plan,
      // regardless of what was stored in the database previously.
      const admin = existing[0]!;
      const updates: Record<string, unknown> = {};

      if (admin.planType !== "unlimited" || admin.dailyLimitMinutes < 9999) {
        updates.planType = "unlimited";
        updates.dailyLimitMinutes = 9999;
        updates.trialEndsAt = new Date("2099-12-31");
        updates.isAdmin = true;
        updates.isActive = true;
      }

      // If ADMIN_PASSWORD env var is set, reset the admin password on startup.
      const forcedPassword = process.env.ADMIN_PASSWORD;
      if (forcedPassword) {
        updates.passwordHash = await hashPassword(forcedPassword);
        logger.info("Admin password updated from ADMIN_PASSWORD env var");
      }

      if (Object.keys(updates).length > 0) {
        await db.update(usersTable)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updates as any)
          .where(eq(usersTable.username, "admin"));
        if (!forcedPassword) logger.info("Admin user upgraded to unlimited plan");
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to ensure admin user");
  }
}

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
