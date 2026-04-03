/**
 * Single source of truth for Postgres URL detection + resolution (API startup, pool, Drizzle Kit).
 * Also scans all process.env entries for postgres:// values — Railway/custom names often differ from DATABASE_URL.
 */

export const POSTGRES_URL_ENV_KEYS = [
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

const POSTGRES_URL_ENV_KEY_SET = new Set<string>(POSTGRES_URL_ENV_KEYS);

/** Strip BOM / wrapping quotes (common when pasting Railway URLs into the dashboard). */
export function normalizeDatabaseEnvValue(raw: string | undefined): string {
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

export function isPlausiblePostgresConnectionString(v: string | undefined): boolean {
  const t = normalizeDatabaseEnvValue(v);
  if (!t) return false;
  if (!/^postgres(ql)?:\/\//i.test(t)) return false;
  if (/\$\{[^}]+\}/.test(t)) return false;
  return true;
}

function envKeyScoreForPostgresUrl(key: string): number {
  const u = key.toUpperCase();
  if (u === "DATABASE_URL") return 100;
  if (u === "DATABASE_PRIVATE_URL") return 99;
  if (u === "DATABASE_PUBLIC_URL") return 98;
  if (u === "DATABASE_URL_UNPOOLED") return 97;
  if (u.includes("DATABASE") && u.includes("URL")) return 80;
  if (u === "POSTGRES_URL" || u === "POSTGRESQL_URL") return 75;
  if (u.includes("POSTGRES") && u.includes("URL")) return 70;
  if (u.includes("SUPABASE") && u.includes("URL")) return 65;
  if (u.includes("NEON") && u.includes("URL")) return 65;
  if (u.includes("DATABASE")) return 40;
  if (u.includes("POSTGRES") || u.startsWith("PG")) return 30;
  return 5;
}

/**
 * Any env var whose value looks like a Postgres URI, excluding keys already tried in POSTGRES_URL_ENV_KEYS
 * (those are handled first in firstDirectPostgresUrlFromEnv).
 */
function findPostgresUrlViaEnvSweep(): string | undefined {
  const candidates: Array<{ value: string; score: number }> = [];
  for (const [key, raw] of Object.entries(process.env)) {
    if (raw === undefined) continue;
    if (POSTGRES_URL_ENV_KEY_SET.has(key)) continue;
    const value = normalizeDatabaseEnvValue(raw);
    if (!isPlausiblePostgresConnectionString(value)) continue;
    candidates.push({ value, score: envKeyScoreForPostgresUrl(key) });
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.value;
}

function firstDirectPostgresUrlFromEnv(): string | undefined {
  for (const key of POSTGRES_URL_ENV_KEYS) {
    const v = normalizeDatabaseEnvValue(process.env[key]);
    if (v && isPlausiblePostgresConnectionString(v)) return v;
  }
  return findPostgresUrlViaEnvSweep();
}

function tryBuildCompositePostgresUrl(): string | undefined {
  const host =
    normalizeDatabaseEnvValue(process.env.PGHOST) ||
    normalizeDatabaseEnvValue(process.env.POSTGRES_HOST);
  const port =
    normalizeDatabaseEnvValue(process.env.PGPORT) ||
    normalizeDatabaseEnvValue(process.env.POSTGRES_PORT) ||
    "5432";
  const user =
    normalizeDatabaseEnvValue(process.env.PGUSER) ||
    normalizeDatabaseEnvValue(process.env.POSTGRES_USER);
  const password =
    process.env.PGPASSWORD ??
    process.env.POSTGRES_PASSWORD ??
    "";
  const database =
    normalizeDatabaseEnvValue(process.env.PGDATABASE) ||
    normalizeDatabaseEnvValue(process.env.POSTGRES_DB);

  if (!host || !user || !database) return undefined;

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

/** True if resolveDatabaseUrlFromEnv() would succeed (direct URI from any env key, or composite PG* / POSTGRES_*). */
export function isDatabaseConnectionEnvConfigured(): boolean {
  return tryResolveDatabaseUrlFromEnv() !== undefined;
}

export function tryResolveDatabaseUrlFromEnv(): string | undefined {
  const direct = firstDirectPostgresUrlFromEnv();
  if (direct) return direct;
  return tryBuildCompositePostgresUrl();
}

export function resolveDatabaseUrlFromEnv(): string {
  const url = tryResolveDatabaseUrlFromEnv();
  if (url) return url;

  throw new Error(
    "Database URL not found. Set DATABASE_URL (or DATABASE_PRIVATE_URL, POSTGRES_URL, or PGHOST+PGUSER+PGDATABASE, etc.). " +
      "On Railway: add a variable reference on the service that runs this container, or use any env var whose value is a postgresql://… URL. " +
      "GET /debug/db-env lists env key names whose values look like Postgres URLs (values never shown).",
  );
}

/** Env keys (names only) whose values look like postgres:// or postgresql:// — for degraded /debug. */
export function listEnvKeysWithPostgresUriValues(maxKeys = 32): string[] {
  const keys: string[] = [];
  for (const [key, raw] of Object.entries(process.env)) {
    if (raw === undefined) continue;
    const v = normalizeDatabaseEnvValue(raw);
    if (isPlausiblePostgresConnectionString(v)) keys.push(key);
  }
  keys.sort((a, b) => a.localeCompare(b));
  return keys.slice(0, maxKeys);
}

export function getCompositePostgresEnvState(): {
  hasHost: boolean;
  hasUser: boolean;
  hasDatabase: boolean;
  configured: boolean;
} {
  const e = process.env;
  const host =
    normalizeDatabaseEnvValue(e.PGHOST) || normalizeDatabaseEnvValue(e.POSTGRES_HOST);
  const user =
    normalizeDatabaseEnvValue(e.PGUSER) || normalizeDatabaseEnvValue(e.POSTGRES_USER);
  const database =
    normalizeDatabaseEnvValue(e.PGDATABASE) || normalizeDatabaseEnvValue(e.POSTGRES_DB);
  const hasHost = Boolean(host);
  const hasUser = Boolean(user);
  const hasDatabase = Boolean(database);
  return {
    hasHost,
    hasUser,
    hasDatabase,
    configured: hasHost && hasUser && hasDatabase,
  };
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
