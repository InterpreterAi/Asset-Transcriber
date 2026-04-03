import "./env-bootstrap.js";
import { getDbEnvStartupLog, getDatabaseUrlRuntimeDebug, isPostgresEnvConfigured } from "./postgres-env.js";
import { getSonioxMasterApiKey } from "./lib/soniox-env.js";

const trim = (k: string) => Boolean(process.env[k]?.trim());
const secretishNames = Object.keys(process.env)
  .filter((k) =>
    /SONIOX|OPENAI|DATABASE|GOOGLE|SESSION|NEXTAUTH|AI_INTEGRATIONS|POSTGRES|PGHOST|PGUSER|PGDATABASE/i.test(
      k,
    ),
  )
  .sort();
console.info(
  "[api-server] Env presence at startup (values never logged):",
  JSON.stringify({
    SONIOX_API_KEY: trim("SONIOX_API_KEY"),
    SONIOX_STT_API_KEY: trim("SONIOX_STT_API_KEY"),
    OPENAI_API_KEY: trim("OPENAI_API_KEY"),
    DATABASE_URL: trim("DATABASE_URL"),
    secretishEnvKeyNames: secretishNames,
    RAILWAY_SERVICE_NAME: process.env.RAILWAY_SERVICE_NAME ?? null,
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT ?? null,
  }),
);

if (!getSonioxMasterApiKey()) {
  console.error(
    "[api-server] Soniox API key missing — set SONIOX_API_KEY or SONIOX_STT_API_KEY (or SONIOX_KEY / SONIOX_API_TOKEN) on this service.",
  );
}

console.info("[api-server] DB env startup probe (no secrets):", JSON.stringify(getDbEnvStartupLog()));

if (!isPostgresEnvConfigured()) {
  console.error(
    "[api-server] Postgres not configured at startup (extended diagnostics, no secrets):",
    JSON.stringify(getDatabaseUrlRuntimeDebug()),
  );
  await import("./no-database-server.js");
} else {
  await import("./server-entry.js");
}
