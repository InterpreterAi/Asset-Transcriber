import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { getSessionSecret } from "../lib/authEnv.js";
import { logger } from "../lib/logger.js";

const PgSession = connectPgSimple(session);
const useMemoryStore = (process.env.SESSION_STORE ?? "").trim().toLowerCase() === "memory";
export const sessionStoreMode = useMemoryStore ? "memory" : "postgres";

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
    "SESSION_STORE=memory enabled; sessions are in-process only (single instance, non-persistent).",
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
          // Self-heal if startup migration did not run; matches official connect-pg-simple DDL.
          createTableIfMissing: true,
        }),
        secret: getSessionSecret(),
        resave: false,
        saveUninitialized: false,
        cookie: sessionCookie,
      },
);
