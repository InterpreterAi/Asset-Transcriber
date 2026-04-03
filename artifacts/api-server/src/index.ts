import { isPostgresEnvConfigured } from "./is-postgres-env-set.js";

if (!isPostgresEnvConfigured()) {
  await import("./no-database-server.js");
} else {
  await import("./server-entry.js");
}
