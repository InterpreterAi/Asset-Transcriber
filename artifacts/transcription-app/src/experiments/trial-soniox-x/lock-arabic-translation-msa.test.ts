import { describe, expect, it } from "vitest";
import { lockArabicTranslationToMsa } from "./lock-arabic-translation-msa";
import { applyFaithfulMeaningFixes } from "./meaning-locks";

describe("lockArabicTranslationToMsa — Gulf/Levantine EN→AR leaks", () => {
  it("rewrites the screenshot dialect translation into فصحى", () => {
    const dialect =
      "نعم يا أخي، أنا فاهم عن ماذا تتكلم، بس المشكلة إني ما أقدر أخلطهم الحين.";
    const out = lockArabicTranslationToMsa(dialect);
    expect(out).not.toMatch(/الحين/);
    expect(out).not.toMatch(/ما أقدر/);
    expect(out).not.toMatch(/\bبس\b/);
    expect(out).not.toMatch(/فاهم/);
    expect(out).toMatch(/الآن/);
    expect(out).toMatch(/لا أستطيع/);
    expect(out).toMatch(/لكن/);
    expect(out).toMatch(/أفهم/);
  });

  it("applyFaithfulMeaningFixes forces فصحى on EN→AR even when Original is English", () => {
    const out = applyFaithfulMeaningFixes(
      "Yes, bro, I understand what you're talking about, it's just that I can't shuffle them right now.",
      "نعم يا أخي، أنا فاهم عن ماذا تتكلم، بس المشكلة إني ما أقدر أخلطهم الحين.",
    );
    expect(out).toMatch(/الآن/);
    expect(out).toMatch(/لا أستطيع/);
    expect(out).not.toMatch(/الحين/);
    expect(out).not.toMatch(/ما أقدر/);
  });

  it("does not rewrite لبس into لكن", () => {
    expect(lockArabicTranslationToMsa("هذا لبس جديد.")).toContain("لبس");
  });
});
