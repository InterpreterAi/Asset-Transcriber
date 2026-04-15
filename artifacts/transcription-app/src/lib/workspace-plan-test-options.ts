/**
 * Account panel “Plan testing” — keep in sync with `ADMIN_TEST_PLAN_TYPES` in
 * `artifacts/api-server/src/routes/payments.ts` (`POST /api/payments/test-activate-plan`).
 *
 * Admins see OpenAI vs Libre on paid rows; other allowed test accounts only see Basic / Professional / Platinum.
 */
export type WorkspacePlanTestOption = {
  planType: string;
  label: string;
  group: "trial" | "paid";
};

const TRIAL_OPTIONS_ADMIN: readonly WorkspacePlanTestOption[] = [
  { planType: "trial-openai", label: "Trial · OpenAI", group: "trial" },
  { planType: "trial-libre", label: "Trial · Libre", group: "trial" },
  { planType: "trial", label: "Trial (legacy)", group: "trial" },
];

const TRIAL_OPTIONS_SIMPLE: readonly WorkspacePlanTestOption[] = [
  { planType: "trial-openai", label: "Trial", group: "trial" },
];

const PAID_OPTIONS_ADMIN: readonly WorkspacePlanTestOption[] = [
  { planType: "basic-openai", label: "Basic · OpenAI", group: "paid" },
  { planType: "professional-openai", label: "Professional · OpenAI", group: "paid" },
  { planType: "platinum", label: "Platinum · OpenAI", group: "paid" },
  { planType: "basic", label: "Basic · Libre", group: "paid" },
  { planType: "professional", label: "Professional · Libre", group: "paid" },
  { planType: "platinum-libre", label: "Platinum · Libre", group: "paid" },
  { planType: "morsy-basic", label: "Morsy Basic · Apr 13 (5h)", group: "paid" },
  { planType: "unlimited", label: "Unlimited", group: "paid" },
];

/** Maps to OpenAI-stack SKUs; labels hide engine (customer-style). */
const PAID_OPTIONS_SIMPLE: readonly WorkspacePlanTestOption[] = [
  { planType: "basic-openai", label: "Basic", group: "paid" },
  { planType: "professional-openai", label: "Professional", group: "paid" },
  { planType: "platinum", label: "Platinum", group: "paid" },
];

export function getWorkspacePlanTestOptions(isAdmin: boolean): readonly WorkspacePlanTestOption[] {
  if (isAdmin) {
    return [...TRIAL_OPTIONS_ADMIN, ...PAID_OPTIONS_ADMIN];
  }
  return [...TRIAL_OPTIONS_SIMPLE, ...PAID_OPTIONS_SIMPLE];
}
