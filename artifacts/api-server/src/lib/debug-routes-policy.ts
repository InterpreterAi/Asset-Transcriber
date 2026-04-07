/**
 * Debug HTTP routes live under `/debug/*` and are only registered when NODE_ENV=development.
 * Production responses are 404 via `blockDebugInProductionMiddleware` (see app.ts).
 */
export const DEBUG_ENDPOINT_PATHS = [
  "/debug/ai-env",
  "/debug/db-env",
  "/debug/auth-env",
  "/debug/readiness",
  "/debug/db-health",
] as const;

/** @deprecated Use path === "/debug" || path.startsWith("/debug/") with NODE_ENV check */
export function isPublicDebugEndpointPath(path: string): boolean {
  return path === "/debug" || path.startsWith("/debug/");
}

/** Only true when running with NODE_ENV=development (e.g. api-server dev:watch). */
export function areDebugHttpEndpointsEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}
