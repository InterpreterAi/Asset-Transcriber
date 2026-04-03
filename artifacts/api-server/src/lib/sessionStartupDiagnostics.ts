import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { getSessionStoreResolution, sessionStoreMode } from "../middlewares/session.js";

function errStack(err: unknown): string | undefined {
  return err instanceof Error ? err.stack : undefined;
}

/**
 * Runs after migrateSchema so user_sessions may exist. Logs DB reachability and,
 * when using Postgres for express-session, whether we can write to user_sessions.
 */
export async function logSessionAndDatabaseStartupStatus(): Promise<void> {
  const resolution = getSessionStoreResolution();

  logger.info(
    {
      sessionStoreMode,
      sessionStoreResolution: resolution,
    },
    "Startup: session store configuration",
  );

  try {
    const ping = await pool.query("SELECT 1 AS ok");
    logger.info(
      { ok: ping.rows[0]?.ok === 1 },
      "Startup: Postgres connection — SELECT 1 succeeded",
    );
  } catch (err) {
    logger.error(
      { err, errStack: errStack(err) },
      "Startup: Postgres connection — SELECT 1 FAILED",
    );
  }

  if (sessionStoreMode !== "postgres") {
    logger.info(
      { sessionStoreMode },
      "Startup: skipping user_sessions probe (not using Postgres session store)",
    );
    return;
  }

  try {
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.user_sessions') AS reg`,
    );
    const rel = reg.rows[0]?.reg;
    logger.info(
      { userSessionsRegclass: rel, exists: Boolean(rel) },
      "Startup: user_sessions — to_regclass(public.user_sessions)",
    );

    if (!rel) {
      logger.error(
        "Startup: user_sessions table missing — connect-pg-simple will fail until it exists or createTableIfMissing creates it",
      );
      return;
    }

    const sid = `__probe_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const sess = JSON.stringify({ probe: true, at: new Date().toISOString() });
    await pool.query(
      `INSERT INTO user_sessions (sid, sess, expire) VALUES ($1, $2::json, NOW() + interval '1 minute')`,
      [sid, sess],
    );
    await pool.query(`DELETE FROM user_sessions WHERE sid = $1`, [sid]);
    logger.info(
      "Startup: user_sessions — probe INSERT + DELETE succeeded (app role can write)",
    );
  } catch (err) {
    logger.error(
      {
        err,
        errStack: errStack(err),
        pgCode: (err as { code?: string })?.code,
      },
      "Startup: user_sessions probe FAILED — session.save will likely return 500 for login/OAuth",
    );
  }
}
