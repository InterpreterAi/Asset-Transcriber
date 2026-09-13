import { describe, expect, it } from "vitest";

import {
  applyCriticalClaimNativeRepair,
  criticalClaimTermsForLang,
} from "./critical-claim-terms";
import { applyGlossaryPostProcess } from "./glossary-post-process";
import { getInterpreterContext } from "../ws/interpreter-context";
import {
  sonioxContextCharLength,
  SONIOX_CONTEXT_SAFE_CHARS,
} from "../ws/soniox-context-budget";

describe("criticalClaimTermsForLang", () => {
  it("includes body parts and insurance for Arabic", () => {
    const rows = criticalClaimTermsForLang("ar");
    expect(rows.some((t) => t.target === "whiplash")).toBe(true);
    expect(rows.some((t) => t.target === "insurance claim")).toBe(true);
    expect(rows.some((t) => t.target === "neck")).toBe(true);
  });
});

describe("applyCriticalClaimNativeRepair", () => {
  it("replaces Latin whiplash leak in Arabic translation", () => {
    const out = applyCriticalClaimNativeRepair(
      "يعاني من whiplash في الرقبة",
      "He has whiplash in the neck",
      "ar",
    );
    expect(out).toContain("إصابة الارتداد العنقي");
    expect(out).not.toMatch(/whiplash/i);
  });

  it("replaces Latin deductible leak", () => {
    const out = applyCriticalClaimNativeRepair(
      "الـ deductible هو 500 دولار",
      "The deductible is 500 dollars",
      "ar",
    );
    expect(out).toContain("الخصم");
  });
});

describe("getInterpreterContext claim + medical pins under tight budget", () => {
  it("stays under SAFE budget and keeps cholesterol + whiplash + MMR", () => {
    const ctx = getInterpreterContext("en", "ar");
    expect(sonioxContextCharLength(ctx)).toBeLessThanOrEqual(SONIOX_CONTEXT_SAFE_CHARS);
    const tt = ctx.translation_terms ?? [];
    expect(
      tt.some(
        (t) =>
          (t.source === "cholesterol" && t.target.includes("كوليسترول")) ||
          (t.target === "cholesterol" && t.source.includes("كوليسترول")),
      ),
    ).toBe(true);
    expect(
      tt.some(
        (t) =>
          (t.source === "whiplash" && t.target.includes("ارتداد")) ||
          (t.target === "whiplash" && t.source.includes("ارتداد")),
      ),
    ).toBe(true);
    expect(
      tt.some((t) => t.source === "MMR" || t.target === "MMR" || /حصبة/.test(t.source + t.target)),
    ).toBe(true);
  });
});

describe("applyGlossaryPostProcess claim repair", () => {
  it("repairs Latin insurance claim leak via post-process", () => {
    const out = applyGlossaryPostProcess(
      "قدّم insurance claim بعد الحادث",
      [],
      {
        originalText: "He filed an insurance claim after the accident",
        rowSourceLanguage: "en",
        langA: "en",
        langB: "ar",
      },
    );
    expect(out).toContain("مطالبة تأمين");
    expect(out).not.toMatch(/insurance claim/i);
  });
});
