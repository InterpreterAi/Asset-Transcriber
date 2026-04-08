/**
 * Free trial only: max real-time interpreting minutes per calendar day.
 * Paid plan limits come from Stripe metadata / admin — do not use this for non-trial enforcement beyond DB sync.
 */
export const TRIAL_DAILY_LIMIT_MINUTES = 180;

/** Length of free trial granted to accounts created from now on. */
export const TRIAL_DAYS_NEW_USERS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * `trial_ends_at` stored on the user row and shown in emails.
 * Existing users keep their already stored value; this is only for new account creation.
 */
export function computeTrialEndsAt(trialStartedAt: Date): Date {
  return new Date(trialStartedAt.getTime() + TRIAL_DAYS_NEW_USERS * MS_PER_DAY);
}
