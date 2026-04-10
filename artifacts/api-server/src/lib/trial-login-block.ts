/**
 * Emergency kill-switch for trial-only access (Railway: TRIAL_LOGIN_BLOCKED=1).
 * Paid plans (basic / professional / platinum / unlimited) and admins are not blocked.
 */

function envTruthy(v: string | undefined): boolean {
  if (v == null) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function isTrialLoginBlocked(): boolean {
  return envTruthy(process.env.TRIAL_LOGIN_BLOCKED);
}

export const TRIAL_LOGIN_BLOCKED_JSON = {
  error:
    "Trial access is temporarily paused for maintenance. Paid accounts are not affected.",
  code: "trial_login_blocked" as const,
  hint:
    "If you operate this server: set TRIAL_LOGIN_BLOCKED=0 or remove it when maintenance is done.",
};
