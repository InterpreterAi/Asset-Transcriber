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
  listEnvKeysWithPostgresUriValues,
  normalizeDatabaseEnvValue,
  parsePostgresConnectionStringFromEnvValue,
  POSTGRES_URL_ENV_KEYS,
} from "../../../lib/db/src/resolve-db-url";

/** Keys we report in /debug/db-env (presence only, never values). */
export const DB_ENV_DIAGNOSTIC_KEYS = [
  ...POSTGRES_URL_ENV_KEYS,
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_DB",
] as const;

function nonEmpty(v: string | undefined): boolean {
  return Boolean(v?.trim());
}

export type EnvKeyProbe = {
  /** `process.env.KEY !== undefined` */
  defined: boolean;
  /** Non-empty after normalize (trim, strip quotes) */
  nonEmpty: boolean;
  /** Value contains a usable postgres(ql):// URI (possibly embedded) */
  parsesAsPostgresUri: boolean;
};

function probeEnvKey(name: string): EnvKeyProbe {
  const v = process.env[name];
  return {
    defined: v !== undefined,
    nonEmpty: normalizeDatabaseEnvValue(v).length > 0,
    parsesAsPostgresUri: parsePostgresConnectionStringFromEnvValue(v) !== undefined,
  };
}

/** Compact JSON-safe object for startup logs (no secret values). */
export function getDbEnvStartupLog(): {
  probe: {
    DATABASE_URL: EnvKeyProbe;
    DATABASE_PRIVATE_URL: EnvKeyProbe;
    POSTGRES_URL: EnvKeyProbe;
    PG_URL: EnvKeyProbe;
    PGDATABASE: EnvKeyProbe;
  };
  envKeysContainingPostgresUri: string[];
  postgresConfigured: boolean;
  processEnvKeyCount: number;
  railwayLikely: boolean;
} {
  return {
    probe: {
      DATABASE_URL: probeEnvKey("DATABASE_URL"),
      DATABASE_PRIVATE_URL: probeEnvKey("DATABASE_PRIVATE_URL"),
      POSTGRES_URL: probeEnvKey("POSTGRES_URL"),
      PG_URL: probeEnvKey("PG_URL"),
      PGDATABASE: probeEnvKey("PGDATABASE"),
    },
    envKeysContainingPostgresUri: listEnvKeysWithPostgresUriValues(),
    postgresConfigured: isDatabaseConnectionEnvConfigured(),
    processEnvKeyCount: Object.keys(process.env).length,
    railwayLikely: Boolean(
      process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_STATIC_URL,
    ),
  };
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
  probe: {
    DATABASE_URL: EnvKeyProbe;
    DATABASE_PRIVATE_URL: EnvKeyProbe;
  };
} {
  const e = process.env;
  const urlKeys = {} as Record<string, UrlKeyRuntimeHint>;
  let firstPlausibleUrlKeyFromKnownList: (typeof POSTGRES_URL_ENV_KEYS)[number] | null = null;

  for (const k of POSTGRES_URL_ENV_KEYS) {
    const t = normalizeDatabaseEnvValue(e[k]);
    const set = t.length > 0;
    const looksLikePostgresUri = parsePostgresConnectionStringFromEnvValue(e[k]) !== undefined;
    const looksLikeUnexpandedReference =
      set && !looksLikePostgresUri && /\$\{[^}]+\}/.test(t);
    urlKeys[k] = { set, length: t.length, looksLikePostgresUri, looksLikeUnexpandedReference };
    if (looksLikePostgresUri && !firstPlausibleUrlKeyFromKnownList) {
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
    probe: {
      DATABASE_URL: probeEnvKey("DATABASE_URL"),
      DATABASE_PRIVATE_URL: probeEnvKey("DATABASE_PRIVATE_URL"),
    },
  };
}

/** Shared body for GET /debug/db-env (degraded minimal server + full Express). */
export function getDebugDbEnvHttpPayload(status: "degraded" | "full_api"): {
  ok: true;
  status: typeof status;
  databaseConfigured: boolean;
  message: string;
  probe: {
    DATABASE_URL: EnvKeyProbe;
    DATABASE_PRIVATE_URL: EnvKeyProbe;
    POSTGRES_URL: EnvKeyProbe;
    PG_URL: EnvKeyProbe;
    PGDATABASE: EnvKeyProbe;
  };
  envKeysContainingPostgresUri: string[];
  env: Record<string, { set: boolean }>;
  runtime: ReturnType<typeof getDatabaseUrlRuntimeDebug>;
} {
  return {
    ok: true,
    status,
    databaseConfigured: isDatabaseConnectionEnvConfigured(),
    message:
      "No secret values. probe.* shows whether standard Railway keys exist / parse as postgres:// URIs. envKeysContainingPostgresUri lists env names whose values embed a Postgres URI (any key).",
    probe: {
      DATABASE_URL: probeEnvKey("DATABASE_URL"),
      DATABASE_PRIVATE_URL: probeEnvKey("DATABASE_PRIVATE_URL"),
      POSTGRES_URL: probeEnvKey("POSTGRES_URL"),
      PG_URL: probeEnvKey("PG_URL"),
      PGDATABASE: probeEnvKey("PGDATABASE"),
    },
    envKeysContainingPostgresUri: listEnvKeysWithPostgresUriValues(),
    env: dbEnvDiagnostic(),
    runtime: getDatabaseUrlRuntimeDebug(),
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
