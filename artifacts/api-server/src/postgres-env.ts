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
  "POSTGRESQL_URL",
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
  "POSTGRES_DB",
] as const;

function nonEmpty(v: string | undefined): boolean {
  return Boolean(v?.trim());
}

/** True if the value is a usable libpq-style connection URI (not a literal `${...}` placeholder). */
function isPlausiblePostgresConnectionUrlValue(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  if (!/^postgres(ql)?:\/\//i.test(t)) return false;
  if (/\$\{[^}]+\}/.test(t)) return false;
  return true;
}

export type UrlKeyRuntimeHint = {
  set: boolean;
  length: number;
  looksLikePostgresUri: boolean;
  looksLikeUnexpandedReference: boolean;
};

/**
 * Safe runtime diagnostics (no secret values). Use in logs and /debug/db-env when DB is missing.
 */
export function getDatabaseUrlRuntimeDebug(): {
  postgresConfigured: boolean;
  databaseUrl: UrlKeyRuntimeHint;
  urlKeys: Record<string, UrlKeyRuntimeHint>;
  firstPlausibleUrlKey: (typeof URL_ENV_KEYS)[number] | null;
} {
  const e = process.env;
  const urlKeys = {} as Record<string, UrlKeyRuntimeHint>;
  let firstPlausibleUrlKey: (typeof URL_ENV_KEYS)[number] | null = null;

  for (const k of URL_ENV_KEYS) {
    const t = e[k]?.trim() ?? "";
    const set = t.length > 0;
    const looksLikePostgresUri = /^postgres(ql)?:\/\//i.test(t);
    const looksLikeUnexpandedReference =
      set && !looksLikePostgresUri && /\$\{[^}]+\}/.test(t);
    urlKeys[k] = { set, length: t.length, looksLikePostgresUri, looksLikeUnexpandedReference };
    const raw = e[k];
    if (nonEmpty(raw) && isPlausiblePostgresConnectionUrlValue(raw!) && !firstPlausibleUrlKey) {
      firstPlausibleUrlKey = k;
    }
  }

  return {
    postgresConfigured: isPostgresEnvConfigured(),
    databaseUrl: urlKeys.DATABASE_URL!,
    urlKeys,
    firstPlausibleUrlKey,
  };
}

export function isPostgresEnvConfigured(): boolean {
  const e = process.env;
  for (const k of URL_ENV_KEYS) {
    const v = e[k];
    if (nonEmpty(v) && isPlausiblePostgresConnectionUrlValue(v!)) return true;
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
