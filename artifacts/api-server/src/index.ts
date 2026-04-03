import { getDatabaseUrlRuntimeDebug, isPostgresEnvConfigured } from "./postgres-env.js";

if (!isPostgresEnvConfigured()) {
  console.error(
    "[api-server] Postgres not configured at startup (safe diagnostics, no secrets):",
    JSON.stringify(getDatabaseUrlRuntimeDebug()),
  );
  await import("./no-database-server.js");
} else {
  await import("./server-entry.js");
}
