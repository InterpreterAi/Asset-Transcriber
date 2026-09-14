/**
 * Isolated Trial · Soniox X plan gate.
 * Does not share transcription/translation engines with other InterpreterAI stacks.
 */
export const TRIAL_SONIOX_X_PLAN_TYPE = "trial-soniox-x";

/** Legacy trial-hetzner accounts use this same isolated Soniox live stack (Hetzner MT is not used). */
export const TRIAL_SONIOX_X_PLAN_TYPES = ["trial-soniox-x", "trial-hetzner"] as const;

export function planUsesTrialSonioxX(planType: string | null | undefined): boolean {
  const p = (planType ?? "").trim().toLowerCase();
  return (TRIAL_SONIOX_X_PLAN_TYPES as readonly string[]).includes(p);
}
