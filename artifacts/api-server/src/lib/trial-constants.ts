/**
 * Free trial only: max real-time interpreting minutes per calendar day.
 * Paid plan limits come from Stripe metadata / admin — do not use this for non-trial enforcement beyond DB sync.
 */
export const TRIAL_DAILY_LIMIT_MINUTES = 180;

/** Length of the free trial in calendar days (must match product copy, e.g. signup “14-day free trial”). */
export const TRIAL_DURATION_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * `trial_ends_at` stored on the user row and shown in emails — always `trialStartedAt` + {@link TRIAL_DURATION_DAYS}.
 */
export function computeTrialEndsAt(trialStartedAt: Date): Date {
  return new Date(trialStartedAt.getTime() + TRIAL_DURATION_DAYS * MS_PER_DAY);
}
