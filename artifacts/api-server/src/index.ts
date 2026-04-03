import "./load-local-env.js";
import { getDbEnvStartupLog, getDatabaseUrlRuntimeDebug, isPostgresEnvConfigured } from "./postgres-env.js";

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
