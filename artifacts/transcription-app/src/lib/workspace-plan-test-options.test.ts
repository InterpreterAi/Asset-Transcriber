import { describe, expect, it } from "vitest";
import { getWorkspacePlanTestOptions } from "./workspace-plan-test-options";

describe("workspace plan testing options", () => {
  it("shows admins the six live Soniox / Soniox X SKUs", () => {
    const opts = getWorkspacePlanTestOptions(true);
    expect(opts.map((o) => o.planType)).toEqual([
      "trial-openai",
      "trial-soniox-x",
      "basic-hetzner",
      "professional-libre",
      "basic-soniox-x",
      "professional-soniox-x",
    ]);
    expect(opts.map((o) => o.label)).toEqual([
      "Trial Soniox",
      "Trial Soniox X",
      "Basic Soniox",
      "Professional Soniox",
      "Basic Soniox X",
      "Professional Soniox X",
    ]);
  });

  it("shows non-admins only Trial / Basic / Professional", () => {
    const opts = getWorkspacePlanTestOptions(false);
    expect(opts.map((o) => o.label)).toEqual(["Trial", "Basic", "Professional"]);
    expect(opts.map((o) => o.planType)).toEqual([
      "trial-openai",
      "basic-hetzner",
      "professional-libre",
    ]);
  });
});
