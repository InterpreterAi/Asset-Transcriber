import { describe, expect, it } from "vitest";
import { getWorkspacePlanTestOptions } from "./workspace-plan-test-options";

describe("workspace plan testing options", () => {
  it("shows admins the six live Soniox X / Soniox (Chuck) SKUs with Soniox X first", () => {
    const opts = getWorkspacePlanTestOptions(true);
    expect(opts.map((o) => o.planType)).toEqual([
      "trial-soniox-x",
      "trial-openai",
      "basic-soniox-x",
      "professional-soniox-x",
      "basic-hetzner",
      "professional-libre",
    ]);
    expect(opts.map((o) => o.label)).toEqual([
      "Trial Soniox X",
      "Trial Soniox",
      "Basic Soniox X",
      "Professional Soniox X",
      "Basic Soniox",
      "Professional Soniox",
    ]);
  });

  it("shows non-admins only Trial / Basic / Professional as Soniox X defaults", () => {
    const opts = getWorkspacePlanTestOptions(false);
    expect(opts.map((o) => o.label)).toEqual(["Trial", "Basic", "Professional"]);
    expect(opts.map((o) => o.planType)).toEqual([
      "trial-soniox-x",
      "basic-soniox-x",
      "professional-soniox-x",
    ]);
  });
});
