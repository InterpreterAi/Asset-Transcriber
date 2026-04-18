/**
 * Free trial only: max real-time interpreting minutes per calendar day.
 * Paid plan limits come from Stripe metadata / admin — do not use this for non-trial enforcement beyond DB sync.
 */
/** New signups and PayPal downgrade trial: max 1 hour interpreting per calendar day. */
export const TRIAL_DAILY_LIMIT_MINUTES = 60;

/**
 * Calendar length for **new** signups only (`auth` / admin-created trial users).
 * Never use this to rewrite `trial_ends_at` for existing rows — the DB may hold 7- or 14-day (or other) cohorts.
 */
export const TRIAL_DAYS_NEW_USERS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Sets `trial_ends_at` when **inserting** a new user. Does not run in migrations or startup sync.
 * Existing users keep whatever `trial_started_at` / `trial_ends_at` is already stored.
 */
export function computeTrialEndsAt(trialStartedAt: Date): Date {
  return new Date(trialStartedAt.getTime() + TRIAL_DAYS_NEW_USERS * MS_PER_DAY);
}
