/**
 * Database env detection (keep logic aligned with lib/db resolveDatabaseUrl).
 * Runs before @workspace/db is imported.
 */

const URL_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_PRIVATE_URL",
  "DATABASE_PUBLIC_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "SUPABASE_DB_URL",
] as const;

/** Keys we report in /debug/db-env (presence only, never values). */
export const DB_ENV_DIAGNOSTIC_KEYS = [
  ...URL_ENV_KEYS,
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
] as const;

function nonEmpty(v: string | undefined): boolean {
  return Boolean(v?.trim());
}

export function isPostgresEnvConfigured(): boolean {
  const e = process.env;
  for (const k of URL_ENV_KEYS) {
    if (nonEmpty(e[k])) return true;
  }
  if (nonEmpty(e.PGHOST) && nonEmpty(e.PGUSER) && nonEmpty(e.PGDATABASE)) return true;
  if (nonEmpty(e.POSTGRES_HOST) && nonEmpty(e.POSTGRES_USER) && nonEmpty(e.POSTGRES_DB)) {
    return true;
  }
  return false;
}

/** Safe for HTTP: which known keys have a non-empty value (no secrets). */
export function dbEnvDiagnostic(): Record<string, { set: boolean }> {
  const e = process.env;
  const out: Record<string, { set: boolean }> = {};
  for (const k of DB_ENV_DIAGNOSTIC_KEYS) {
    out[k] = { set: nonEmpty(e[k]) };
  }
  return out;
}
