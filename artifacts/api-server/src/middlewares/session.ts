import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { getSessionSecret } from "../lib/authEnv.js";
import { logger } from "../lib/logger.js";

const PgSession = connectPgSimple(session);

const disableTempForce = ["1", "true", "yes"].includes(
  (process.env.DISABLE_TEMP_FORCE_MEMORY ?? "").trim().toLowerCase(),
);

/**
 * MemoryStore by default (avoids Postgres `user_sessions` failures → HTTP 500 on login/OAuth).
 * Set `SESSION_STORE=postgres` only for multi-replica; then set `DISABLE_TEMP_FORCE_MEMORY=1`
 * so that env is respected. Flip this to `false` when Postgres sessions are fully verified.
 */
const TEMP_FORCE_MEMORY_IN_SOURCE = true;

/**
 * Effective in-code / env toggle for forcing MemoryStore (diagnosing session 500s).
 */
export const TEMPORARY_FORCE_MEMORY_SESSION_IN_CODE =
  !disableTempForce && TEMP_FORCE_MEMORY_IN_SOURCE;

const envSessionRaw = process.env.SESSION_STORE ?? "";
const envWantsMemory = envSessionRaw.trim().toLowerCase() === "memory";

const useMemoryStore = TEMPORARY_FORCE_MEMORY_SESSION_IN_CODE || envWantsMemory;

export const sessionStoreMode: "memory" | "postgres" = useMemoryStore ? "memory" : "postgres";

export function getSessionStoreResolution(): {
  TEMP_FORCE_MEMORY_IN_SOURCE: boolean;
  TEMPORARY_FORCE_MEMORY_SESSION_IN_CODE: boolean;
  DISABLE_TEMP_FORCE_MEMORY: string | null;
  envSESSION_STORE: string | null;
  envWantsMemory: boolean;
  effectiveMode: "memory" | "postgres";
} {
  return {
    TEMP_FORCE_MEMORY_IN_SOURCE,
    TEMPORARY_FORCE_MEMORY_SESSION_IN_CODE,
    DISABLE_TEMP_FORCE_MEMORY: process.env.DISABLE_TEMP_FORCE_MEMORY ?? null,
    envSESSION_STORE: envSessionRaw.trim() === "" ? null : envSessionRaw.trim(),
    envWantsMemory,
    effectiveMode: sessionStoreMode,
  };
}

if (TEMPORARY_FORCE_MEMORY_SESSION_IN_CODE && envSessionRaw.trim().toLowerCase() === "postgres") {
  logger.warn(
    "TEMPORARY_FORCE_MEMORY_SESSION_IN_CODE: ignoring SESSION_STORE=postgres — using MemoryStore. Set DISABLE_TEMP_FORCE_MEMORY=1 to use Postgres sessions.",
  );
}

const production = process.env.NODE_ENV === "production";
const sessionCookieInsecure =
  (process.env.SESSION_COOKIE_SECURE ?? "").trim().toLowerCase() === "false" ||
  (process.env.SESSION_COOKIE_SECURE ?? "").trim() === "0";
/** Railway / reverse proxies: without proxy:true, Secure cookies may never attach (req.secure stays false). */
const sessionCookie = {
  secure: production && !sessionCookieInsecure,
  ...(production && !sessionCookieInsecure ? { proxy: true as const } : {}),
  httpOnly: true,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: "lax" as const,
};

if (useMemoryStore) {
  logger.warn(
    { sessionStoreMode, TEMPORARY_FORCE_MEMORY_SESSION_IN_CODE, envSESSION_STORE: envSessionRaw || null },
    "Session: using MemoryStore (in-process; single-instance only — not durable across restarts)",
  );
} else {
  logger.info(
    { sessionStoreMode },
    "Session: using connect-pg-simple (Postgres user_sessions)",
  );
}

export const sessionMiddleware = session(
  useMemoryStore
    ? {
        secret: getSessionSecret(),
        resave: false,
        saveUninitialized: false,
        cookie: sessionCookie,
      }
    : {
        store: new PgSession({
          pool,
          tableName: "user_sessions",
          createTableIfMissing: true,
        }),
        secret: getSessionSecret(),
        resave: false,
        saveUninitialized: false,
        cookie: sessionCookie,
      },
);
