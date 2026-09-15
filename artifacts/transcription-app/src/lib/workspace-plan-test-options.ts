/**
 * Account panel “Plan testing” and Admin → Users plan picker.
 * Keep in sync with `ADMIN_TEST_PLAN_TYPES` in
 * `artifacts/api-server/src/routes/payments.ts` (`POST /api/payments/test-activate-plan`).
 *
 * Live SKUs (DB `plan_type` values are legacy names; labels are the product names):
 *   trial-openai          → Trial Soniox          (Chunk v2, 2h)
 *   basic-hetzner         → Basic Soniox          (Chunk v2, 5h)
 *   professional-libre    → Professional Soniox   (Chunk v2, 12h stored / unlimited in UI)
 *   trial-soniox-x        → Trial Soniox X        (isolated live STT+MT, 2h)
 *   basic-soniox-x        → Basic Soniox X        (isolated live STT+MT, 5h)
 *   professional-soniox-x → Professional Soniox X (isolated live STT+MT, 12h stored / unlimited in UI)
 */

export type WorkspacePlanTestOption = {
  planType: string;
  label: string;
  group: "trial" | "paid";
};

export const ADMIN_PLAN_PICKER_SONIOX: readonly WorkspacePlanTestOption[] = [
  { planType: "trial-openai", label: "Trial Soniox", group: "trial" },
  { planType: "basic-hetzner", label: "Basic Soniox", group: "paid" },
  { planType: "professional-libre", label: "Professional Soniox", group: "paid" },
];

export const ADMIN_PLAN_PICKER_SONIOX_X: readonly WorkspacePlanTestOption[] = [
  { planType: "trial-soniox-x", label: "Trial Soniox X", group: "trial" },
  { planType: "basic-soniox-x", label: "Basic Soniox X", group: "paid" },
  { planType: "professional-soniox-x", label: "Professional Soniox X", group: "paid" },
];

const TRIAL_OPTIONS_ADMIN: readonly WorkspacePlanTestOption[] = [
  ...ADMIN_PLAN_PICKER_SONIOX.filter((o) => o.group === "trial"),
  ...ADMIN_PLAN_PICKER_SONIOX_X.filter((o) => o.group === "trial"),
];

const PAID_OPTIONS_ADMIN: readonly WorkspacePlanTestOption[] = [
  ...ADMIN_PLAN_PICKER_SONIOX.filter((o) => o.group === "paid"),
  ...ADMIN_PLAN_PICKER_SONIOX_X.filter((o) => o.group === "paid"),
];

/** Customers / non-admin testers: tier names only, Chunk v2 defaults. */
const USER_PLAN_OPTIONS: readonly WorkspacePlanTestOption[] = [
  { planType: "trial-openai", label: "Trial", group: "trial" },
  { planType: "basic-hetzner", label: "Basic", group: "paid" },
  { planType: "professional-libre", label: "Professional", group: "paid" },
];

export function getWorkspacePlanTestOptions(isAdmin: boolean): readonly WorkspacePlanTestOption[] {
  if (isAdmin) {
    return [...TRIAL_OPTIONS_ADMIN, ...PAID_OPTIONS_ADMIN];
  }
  return USER_PLAN_OPTIONS;
}
