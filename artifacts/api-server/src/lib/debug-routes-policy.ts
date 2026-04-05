/**
 * Public /debug/* HTTP routes must not expose env metadata outside local development.
 * Used by the unified Asset-Transcriber deploy (Express + SPA) and the no-DB fallback server.
 */
export const DEBUG_ENDPOINT_PATHS = [
  "/debug/ai-env",
  "/debug/db-env",
  "/debug/auth-env",
  "/debug/readiness",
] as const;

const DEBUG_PATH_SET = new Set<string>(DEBUG_ENDPOINT_PATHS);

export function isPublicDebugEndpointPath(path: string): boolean {
  return DEBUG_PATH_SET.has(path);
}

/** Only true when running with NODE_ENV=development (e.g. api-server dev:watch). */
export function areDebugHttpEndpointsEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}
