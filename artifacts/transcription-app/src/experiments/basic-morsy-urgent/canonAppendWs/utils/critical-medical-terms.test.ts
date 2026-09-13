import { describe, expect, it } from "vitest";

import {
  applyCriticalMedicalNativeRepair,
  criticalMedicalTermsForLang,
} from "./critical-medical-terms";
import { applyGlossaryPostProcess } from "./glossary-post-process";
import { getInterpreterContext } from "../ws/interpreter-context";
import {
  sonioxContextCharLength,
  SONIOX_CONTEXT_SAFE_CHARS,
} from "../ws/soniox-context-budget";

describe("criticalMedicalTermsForLang", () => {
  it("includes cholesterol for Arabic and Spanish", () => {
    expect(criticalMedicalTermsForLang("ar").some((t) => t.target === "cholesterol")).toBe(true);
    expect(criticalMedicalTermsForLang("es").some((t) => t.target === "cholesterol")).toBe(true);
  });
});

describe("applyCriticalMedicalNativeRepair", () => {
  it("fixes cholesterol→فقر الدم confusion when original said cholesterol", () => {
    const out = applyCriticalMedicalNativeRepair(
      "هل تتناول أتورفاستاتين لفقر الدم؟",
      "Are you taking atorvastatin for cholesterol?",
      "ar",
    );
    expect(out).toContain("الكوليسترول");
    expect(out).not.toContain("فقر الدم");
  });

  it("does not rewrite فقر الدم when original said anemia", () => {
    const out = applyCriticalMedicalNativeRepair(
      "يعاني من فقر الدم",
      "He has anemia",
      "ar",
    );
    expect(out).toContain("فقر الدم");
  });

  it("replaces Latin cholesterol leak in Arabic translation", () => {
    const out = applyCriticalMedicalNativeRepair(
      "ارتفاع cholesterol في الدم",
      "High cholesterol in the blood",
      "ar",
    );
    expect(out).toContain("الكوليسترول");
    expect(out).not.toMatch(/cholesterol/i);
  });

  it("leaves translation alone when original has no critical lemma", () => {
    const src = "نعم، شكراً";
    expect(applyCriticalMedicalNativeRepair(src, "Yes thanks", "ar")).toBe(src);
  });
});

describe("getInterpreterContext critical medical pins", () => {
  it("keeps cholesterol EN↔AR pins under Soniox budget", () => {
    const ctx = getInterpreterContext("en", "ar");
    expect(sonioxContextCharLength(ctx)).toBeLessThanOrEqual(SONIOX_CONTEXT_SAFE_CHARS);
    const terms = ctx.translation_terms ?? [];
    expect(
      terms.some(
        (t) =>
          (t.source === "cholesterol" && t.target.includes("كوليسترول")) ||
          (t.target === "cholesterol" && t.source.includes("كوليسترول")),
      ),
    ).toBe(true);
  });

  it("keeps cholesterol for languages without TERMS_BY_LANG packs (en↔fr)", () => {
    const ctx = getInterpreterContext("en", "fr");
    expect(sonioxContextCharLength(ctx)).toBeLessThanOrEqual(SONIOX_CONTEXT_SAFE_CHARS);
    const terms = ctx.translation_terms ?? [];
    expect(
      terms.some(
        (t) =>
          (t.source === "cholesterol" && t.target.toLowerCase().includes("cholest")) ||
          (t.target === "cholesterol" && t.source.toLowerCase().includes("cholest")),
      ),
    ).toBe(true);
  });
});

describe("applyGlossaryPostProcess critical medical", () => {
  it("repairs cholesterol confusion via post-process opts", () => {
    const out = applyGlossaryPostProcess(
      "هل تتناول أتورفاستاتين لفقر الدم؟",
      [],
      {
        originalText: "Are you taking atorvastatin for cholesterol?",
        rowSourceLanguage: "en",
        langA: "en",
        langB: "ar",
      },
    );
    expect(out).toContain("الكوليسترول");
    expect(out).not.toContain("فقر الدم");
  });
});
