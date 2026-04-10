function envTruthy(v: string | undefined): boolean {
  if (v == null) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Emergency full lock for all API users.
 * Set GLOBAL_ACCESS_BLOCKED=1 on the API service to enable.
 */
export function isGlobalAccessBlocked(): boolean {
  return envTruthy(process.env.GLOBAL_ACCESS_BLOCKED);
}

export const GLOBAL_ACCESS_BLOCKED_JSON = {
  error: "Service is temporarily paused for maintenance.",
  code: "service_temporarily_paused" as const,
  hint: "If you operate this server: set GLOBAL_ACCESS_BLOCKED=0 (or remove it) to resume access.",
};
