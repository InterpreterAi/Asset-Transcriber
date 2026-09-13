import { describe, expect, it } from "vitest";
import { repairChunkV2FalsePeriods } from "./chunk-v2-false-period-repair";

describe("repairChunkV2FalsePeriods", () => {
  it("fixes she's. Almost (live medical session)", () => {
    expect(repairChunkV2FalsePeriods("Yeah, she's. Almost out of the restroom, sorry about that.")).toBe(
      "Yeah, she's Almost out of the restroom, sorry about that.",
    );
  });

  it("fixes getting. A nude (reel)", () => {
    expect(repairChunkV2FalsePeriods("I'd never heard of a man getting. A nude from a woman")).toBe(
      "I'd never heard of a man getting a nude from a woman",
    );
  });

  it("fixes And then. I do have…", () => {
    expect(repairChunkV2FalsePeriods("And then. I do have her morning medications.")).toBe(
      "And then I do have her morning medications.",
    );
  });

  it("fixes the. Bag needed…", () => {
    expect(repairChunkV2FalsePeriods("because the. Bag needed to be refilled.")).toBe(
      "because the Bag needed to be refilled.",
    );
  });

  it("keeps a real sentence boundary before Sorry", () => {
    expect(
      repairChunkV2FalsePeriods("Almost out of the restroom. Sorry about that."),
    ).toBe("Almost out of the restroom. Sorry about that.");
  });

  it("keeps decimals and Dr. titles", () => {
    expect(repairChunkV2FalsePeriods("Dose is 0. 75 mg with Dr. Smith.")).toBe(
      "Dose is 0.75 mg with Dr. Smith.",
    );
  });

  it("repairs Arabic mid-clause Latin periods mirrored from EN", () => {
    expect(repairChunkV2FalsePeriods("نعم، هي. على وشك أن تخرج")).toBe("نعم، هي على وشك أن تخرج");
    expect(repairChunkV2FalsePeriods("حسنًا. ثم. لهذه أدوية")).toMatch(/ثم لهذه/);
  });

  it("keeps real EN sentence end before Arabic code-switch", () => {
    expect(repairChunkV2FalsePeriods("Hello there. عندي ألم شديد")).toBe("Hello there. عندي ألم شديد");
  });
});
