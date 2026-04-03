import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { resolveDatabaseUrlFromEnv, getDatabaseConnectionFingerprint } from "./resolve-db-url.js";

const { Pool } = pg;

/** Resolved from env via `resolveDatabaseUrlFromEnv()` — prefers `DATABASE_URL`, never `DATABASE_PUBLIC_URL` (client-only). */
export const resolvedDatabaseUrl = resolveDatabaseUrlFromEnv();

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_STATIC_URL,
);
const looksLikeManagedHost =
  /railway\.app|rlwy\.net|railway\.internal|neon\.tech|supabase\.co|amazonaws\.com/i.test(
    resolvedDatabaseUrl,
  );

const poolConfig: pg.PoolConfig = { connectionString: resolvedDatabaseUrl };
if (isRailway || looksLikeManagedHost) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });

export * from "./schema";
export { getDatabaseConnectionFingerprint };
