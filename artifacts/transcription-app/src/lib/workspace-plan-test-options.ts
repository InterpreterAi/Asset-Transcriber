/**
 * Account panel “Plan testing” — keep in sync with `ADMIN_TEST_PLAN_TYPES` in
 * `artifacts/api-server/src/routes/payments.ts` (`POST /api/payments/test-activate-plan`).
 *
 * Eight canonical tiers: OpenAI (`trial`, `basic`, `professional`, `platinum`) and Hetzner machine `*-libre`.
 */
export type WorkspacePlanTestOption = {
  planType: string;
  label: string;
  group: "trial" | "paid";
};

const TRIAL_OPTIONS_ADMIN: readonly WorkspacePlanTestOption[] = [
  { planType: "trial-libre", label: "Trial · Hetzner", group: "trial" },
  { planType: "trial", label: "Trial · OpenAI", group: "trial" },
];

const TRIAL_OPTIONS_SIMPLE: readonly WorkspacePlanTestOption[] = [
  { planType: "trial", label: "Trial", group: "trial" },
];

const PAID_OPTIONS_ADMIN: readonly WorkspacePlanTestOption[] = [
  { planType: "basic", label: "Basic · OpenAI", group: "paid" },
  { planType: "professional", label: "Professional · OpenAI", group: "paid" },
  { planType: "platinum", label: "Platinum · OpenAI", group: "paid" },
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
