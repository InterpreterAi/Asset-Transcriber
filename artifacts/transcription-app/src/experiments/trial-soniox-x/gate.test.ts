import { describe, expect, it } from "vitest";
import { planUsesTrialSonioxX } from "./gate";
import { sonioxTwoWayLanguageHints, workspaceLangToOfficialSonioxCode } from "./soniox-lang";

describe("trial-soniox-x gate", () => {
  it("matches Soniox X trial, basic, professional, and retired trial-hetzner", () => {
    expect(planUsesTrialSonioxX("trial-soniox-x")).toBe(true);
    expect(planUsesTrialSonioxX("trial-hetzner")).toBe(true);
    expect(planUsesTrialSonioxX("basic-soniox-x")).toBe(true);
    expect(planUsesTrialSonioxX("professional-soniox-x")).toBe(true);
    expect(planUsesTrialSonioxX("trial-libre")).toBe(false);
    expect(planUsesTrialSonioxX("basic-hetzner")).toBe(false);
    expect(planUsesTrialSonioxX("professional-libre")).toBe(false);
  });
});

describe("workspaceLangToOfficialSonioxCode", () => {
  it("maps workspace codes onto the official live-demo list", () => {
    expect(workspaceLangToOfficialSonioxCode("en")).toBe("en");
    expect(workspaceLangToOfficialSonioxCode("ar")).toBe("ar");
    expect(workspaceLangToOfficialSonioxCode("zh-CN")).toBe("zh");
    expect(workspaceLangToOfficialSonioxCode("nb")).toBe("no");
    expect(workspaceLangToOfficialSonioxCode("so")).toBe(null);
  });
});

describe("sonioxTwoWayLanguageHints", () => {
  it("puts Arabic before English for the default interpreter pair", () => {
    expect(sonioxTwoWayLanguageHints("en", "ar")).toEqual(["ar", "en"]);
    expect(sonioxTwoWayLanguageHints("ar", "en")).toEqual(["ar", "en"]);
  });
});
