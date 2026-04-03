/**
 * Shared Postgres URL resolution for the API pool, Drizzle Kit, and one-off scripts.
 * Keep in sync with artifacts/api-server/src/postgres-env.ts (URL key order + validation).
 */

const POSTGRES_URL_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_PRIVATE_URL",
  "DATABASE_PUBLIC_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "POSTGRESQL_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "SUPABASE_DB_URL",
] as const;

function isPlausiblePostgresConnectionUrlValue(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  if (!/^postgres(ql)?:\/\//i.test(t)) return false;
  if (/\$\{[^}]+\}/.test(t)) return false;
  return true;
}

function firstDirectPostgresUrlFromEnv(): string | undefined {
  for (const key of POSTGRES_URL_ENV_KEYS) {
    const v = process.env[key]?.trim();
    if (v && isPlausiblePostgresConnectionUrlValue(v)) return v;
  }
  return undefined;
}

export function resolveDatabaseUrlFromEnv(): string {
  const direct = firstDirectPostgresUrlFromEnv();
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
    "Database URL not found. Set DATABASE_URL (or DATABASE_PRIVATE_URL, POSTGRES_URL, or PGHOST+PGUSER+PGDATABASE, etc.). " +
      "On Railway: copy from Postgres service or add a variable reference on the service that runs this command.",
  );
}

/** Host + database name only (no credentials) — for /debug/db-health. */
export function getDatabaseConnectionFingerprint(): { host: string | null; database: string | null } {
  try {
    const connectionString = resolveDatabaseUrlFromEnv();
    const u = new URL(connectionString.replace(/^postgresql:/i, "postgres:"));
    const path = (u.pathname || "").replace(/^\//, "");
    const database = (path.split("?")[0] || "").split("/")[0] || null;
    return { host: u.hostname || null, database };
  } catch {
    return { host: null, database: null };
  }
}
