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

/** Strip BOM / wrapping quotes (common when pasting Railway URLs into the dashboard). */
function normalizeEnvConnectionString(raw: string | undefined): string {
  if (raw === undefined || raw === null) return "";
  let t = String(raw).replace(/^\uFEFF/, "").trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * True if env has host + user + database using the same mixing rules as
 * `resolveDatabaseUrlFromEnv` (PG* and POSTGRES_* can be combined — Railway sometimes
 * injects a mix, and the old check here required an all-PG or all-POSTGRES set only).
 */
function isCompositePostgresEnvConfigured(e: NodeJS.ProcessEnv): boolean {
  const host = normalizeEnvConnectionString(e.PGHOST) || normalizeEnvConnectionString(e.POSTGRES_HOST);
  const user = normalizeEnvConnectionString(e.PGUSER) || normalizeEnvConnectionString(e.POSTGRES_USER);
  const database =
    normalizeEnvConnectionString(e.PGDATABASE) || normalizeEnvConnectionString(e.POSTGRES_DB);
  return Boolean(host && user && database);
}

/** True if the value is a usable libpq-style connection URI (not a literal `${...}` placeholder). */
function isPlausiblePostgresConnectionUrlValue(v: string | undefined): boolean {
  const t = normalizeEnvConnectionString(v);
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
  /** PG* / POSTGRES_* mix (same rules as resolveDatabaseUrlFromEnv); no secret values. */
  compositePostgres: {
    configured: boolean;
    hasHost: boolean;
    hasUser: boolean;
    hasDatabase: boolean;
  };
} {
  const e = process.env;
  const urlKeys = {} as Record<string, UrlKeyRuntimeHint>;
  let firstPlausibleUrlKey: (typeof URL_ENV_KEYS)[number] | null = null;

  const hostPg = normalizeEnvConnectionString(e.PGHOST);
  const hostPo = normalizeEnvConnectionString(e.POSTGRES_HOST);
  const userPg = normalizeEnvConnectionString(e.PGUSER);
  const userPo = normalizeEnvConnectionString(e.POSTGRES_USER);
  const dbPg = normalizeEnvConnectionString(e.PGDATABASE);
  const dbPo = normalizeEnvConnectionString(e.POSTGRES_DB);
  const hasHost = Boolean(hostPg || hostPo);
  const hasUser = Boolean(userPg || userPo);
  const hasDatabase = Boolean(dbPg || dbPo);

  for (const k of URL_ENV_KEYS) {
    const t = normalizeEnvConnectionString(e[k]);
    const set = t.length > 0;
    const looksLikePostgresUri = /^postgres(ql)?:\/\//i.test(t);
    const looksLikeUnexpandedReference =
      set && !looksLikePostgresUri && /\$\{[^}]+\}/.test(t);
    urlKeys[k] = { set, length: t.length, looksLikePostgresUri, looksLikeUnexpandedReference };
    const raw = e[k];
    if (isPlausiblePostgresConnectionUrlValue(raw) && !firstPlausibleUrlKey) {
      firstPlausibleUrlKey = k;
    }
  }

  return {
    postgresConfigured: isPostgresEnvConfigured(),
    databaseUrl: urlKeys.DATABASE_URL!,
    urlKeys,
    firstPlausibleUrlKey,
    compositePostgres: {
      configured: isCompositePostgresEnvConfigured(e),
      hasHost,
      hasUser,
      hasDatabase,
    },
  };
}

export function isPostgresEnvConfigured(): boolean {
  const e = process.env;
  for (const k of URL_ENV_KEYS) {
    if (isPlausiblePostgresConnectionUrlValue(e[k])) return true;
  }
  if (isCompositePostgresEnvConfigured(e)) return true;
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
