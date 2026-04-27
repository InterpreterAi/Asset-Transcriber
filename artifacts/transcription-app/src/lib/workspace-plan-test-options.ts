/**
 * Account panel “Plan testing” — keep in sync with `ADMIN_TEST_PLAN_TYPES` in
 * `artifacts/api-server/src/routes/payments.ts` (`POST /api/payments/test-activate-plan`).
 *
 * Paid OpenAI tiers use explicit `*-openai` plan_type; Hetzner uses `*-libre`. Legacy bare `basic`/`professional`/`platinum` may still exist in DB.
 */
export type WorkspacePlanTestOption = {
  planType: string;
  label: string;
  group: "trial" | "paid";
};

const TRIAL_OPTIONS_ADMIN: readonly WorkspacePlanTestOption[] = [
  { planType: "trial-openai", label: "Trial · OpenAI (7d)", group: "trial" },
  { planType: "trial-hetzner", label: "Trial · Hetzner (7d)", group: "trial" },
  { planType: "trial-libre", label: "Trial · Mixed (1-4 OpenAI, then Hetzner)", group: "trial" },
  { planType: "trial", label: "Trial · OpenAI (legacy)", group: "trial" },
];

const TRIAL_OPTIONS_SIMPLE: readonly WorkspacePlanTestOption[] = [
  { planType: "trial", label: "Trial", group: "trial" },
];

const PAID_OPTIONS_ADMIN: readonly WorkspacePlanTestOption[] = [
  { planType: "basic-openai", label: "Basic · OpenAI", group: "paid" },
  { planType: "professional-openai", label: "Professional · OpenAI", group: "paid" },
  { planType: "platinum-openai", label: "Platinum · OpenAI", group: "paid" },
  { planType: "basic-libre", label: "Basic · Hetzner", group: "paid" },
  { planType: "professional-libre", label: "Professional · Hetzner", group: "paid" },
  { planType: "platinum-libre", label: "Platinum · Hetzner", group: "paid" },
];

/** PayPal checkout SKUs (OpenAI stack). */
const PAID_OPTIONS_SIMPLE: readonly WorkspacePlanTestOption[] = [
  { planType: "basic", label: "Basic", group: "paid" },
  { planType: "professional", label: "Professional", group: "paid" },
  { planType: "platinum", label: "Platinum", group: "paid" },
];

export function getWorkspacePlanTestOptions(isAdmin: boolean): readonly WorkspacePlanTestOption[] {
  if (isAdmin) {
    return [...TRIAL_OPTIONS_ADMIN, ...PAID_OPTIONS_ADMIN];
  }
  return [...TRIAL_OPTIONS_SIMPLE, ...PAID_OPTIONS_SIMPLE];
}
