/**
 * Isolated Soniox X plan gate (Trial / Basic / Professional).
 * Does not share transcription/translation engines with Chunk v2 or Final Boss 3.
 */
export const TRIAL_SONIOX_X_PLAN_TYPE = "trial-soniox-x";

/** Isolated official Soniox live STT+translation. Legacy trial-hetzner stays on this stack. */
export const TRIAL_SONIOX_X_PLAN_TYPES = [
  "trial-soniox-x",
  "trial-hetzner",
  "basic-soniox-x",
  "professional-soniox-x",
] as const;

export function planUsesTrialSonioxX(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return (TRIAL_SONIOX_X_PLAN_TYPES as readonly string[]).includes(p);
}
