/**
 * Database env diagnostics for the API server.
 * Whether Postgres is “configured” matches `resolveDatabaseUrlFromEnv()` in @workspace/db/resolve-db-url
 * (including a full process.env sweep for postgresql:// values under any variable name).
 *
 * Import path is extensionless so `tsc` resolves the workspace `.ts` file; `.js` incorrectly resolved to an empty module here.
 */

export {
  isDatabaseConnectionEnvConfigured as isPostgresEnvConfigured,
  listEnvKeysWithPostgresUriValues,
} from "../../../lib/db/src/resolve-db-url";

import {
  getCompositePostgresEnvState,
  isDatabaseConnectionEnvConfigured,
  isPlausiblePostgresConnectionString,
  listEnvKeysWithPostgresUriValues,
  normalizeDatabaseEnvValue,
  POSTGRES_URL_ENV_KEYS,
} from "../../../lib/db/src/resolve-db-url";

/** Keys we report in /debug/db-env (presence only, never values). */
export const DB_ENV_DIAGNOSTIC_KEYS = [
  ...POSTGRES_URL_ENV_KEYS,
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
  firstPlausibleUrlKeyFromKnownList: (typeof POSTGRES_URL_ENV_KEYS)[number] | null;
  envKeysWithPostgresUriValues: string[];
  compositePostgres: ReturnType<typeof getCompositePostgresEnvState>;
  processEnv: { keyCount: number; railwayLikely: boolean };
} {
  const e = process.env;
  const urlKeys = {} as Record<string, UrlKeyRuntimeHint>;
  let firstPlausibleUrlKeyFromKnownList: (typeof POSTGRES_URL_ENV_KEYS)[number] | null = null;

  for (const k of POSTGRES_URL_ENV_KEYS) {
    const t = normalizeDatabaseEnvValue(e[k]);
    const set = t.length > 0;
    const looksLikePostgresUri = /^postgres(ql)?:\/\//i.test(t);
    const looksLikeUnexpandedReference =
      set && !looksLikePostgresUri && /\$\{[^}]+\}/.test(t);
    urlKeys[k] = { set, length: t.length, looksLikePostgresUri, looksLikeUnexpandedReference };
    if (isPlausiblePostgresConnectionString(e[k]) && !firstPlausibleUrlKeyFromKnownList) {
      firstPlausibleUrlKeyFromKnownList = k;
    }
  }

  return {
    postgresConfigured: isDatabaseConnectionEnvConfigured(),
    databaseUrl: urlKeys.DATABASE_URL!,
    urlKeys,
    firstPlausibleUrlKeyFromKnownList,
    envKeysWithPostgresUriValues: listEnvKeysWithPostgresUriValues(),
    compositePostgres: getCompositePostgresEnvState(),
    processEnv: {
      keyCount: Object.keys(process.env).length,
      railwayLikely: Boolean(
        process.env.RAILWAY_ENVIRONMENT ||
          process.env.RAILWAY_PROJECT_ID ||
          process.env.RAILWAY_STATIC_URL,
      ),
    },
  };
}

/** Safe for HTTP: which known keys have a non-empty value (no secrets). */
export function dbEnvDiagnostic(): Record<string, { set: boolean }> {
  const env = process.env;
  const out: Record<string, { set: boolean }> = {};
  for (const k of DB_ENV_DIAGNOSTIC_KEYS) {
    out[k] = { set: nonEmpty(env[k]) };
  }
  return out;
}
