import { isPostgresEnvConfigured } from "./postgres-env.js";

if (!isPostgresEnvConfigured()) {
  await import("./no-database-server.js");
} else {
  await import("./server-entry.js");
}
