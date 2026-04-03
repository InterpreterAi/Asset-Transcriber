import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * Resolve Postgres URL for Railway / Docker / local.
 * Railway: variables live on the Postgres *service*; your API must reference them
 * (Variables → New → Reference → Postgres → DATABASE_URL), or set PG* the same way.
 */
function resolveDatabaseUrl(): string {
  const direct =
    process.env.DATABASE_URL?.trim() ||
    process.env.DATABASE_PRIVATE_URL?.trim() ||
    process.env.DATABASE_PUBLIC_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.NEON_DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim();
  if (direct) return direct;

  const host =
    process.env.PGHOST?.trim() || process.env.POSTGRES_HOST?.trim();
  const port =
    process.env.PGPORT?.trim() ||
    process.env.POSTGRES_PORT?.trim() ||
    "5432";
  const user =
    process.env.PGUSER?.trim() || process.env.POSTGRES_USER?.trim();
  const password =
    process.env.PGPASSWORD ??
    process.env.POSTGRES_PASSWORD ??
    "";
  const database =
    process.env.PGDATABASE?.trim() || process.env.POSTGRES_DB?.trim();

  if (host && user && database) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(password);
    let url = `postgresql://${u}:${p}@${host}:${port}/${database}`;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    const wantSsl =
      process.env.PGSSLMODE === "require" ||
      (!isLocal && Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID));
    if (wantSsl) {
      url += url.includes("?") ? "&" : "?";
      url += "sslmode=require";
    }
    return url;
  }

  throw new Error(
    "Database configuration missing. On Railway: add a PostgreSQL service, then in THIS (API) service open Variables → " +
      "New variable → Variable Reference → select your Postgres service → choose DATABASE_URL (or DATABASE_PRIVATE_URL). " +
      "Until that reference exists, the API cannot start. Local dev: set DATABASE_URL in .env.",
  );
}

/** Same URL used by the pool — use for Stripe sync / migrations when DATABASE_URL env is unset but PG* vars are. */
export const resolvedDatabaseUrl = resolveDatabaseUrl();

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
