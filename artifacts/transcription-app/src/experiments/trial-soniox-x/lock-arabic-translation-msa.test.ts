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

  it("leaves correct فصحى untouched", () => {
    const msa = [
      "ولا أي شيء حلو، ولا الآيس كريم.",
      "نحن بحاجة إلى التأكيد على ذلك.",
      "هي في حاجة إلى علاج.",
      "المريض محتاج إلى رعاية.",
      "الألم موجع جدا.",
      "أنا أقدر وقتك.",
      "هل تقدر على المشي؟",
      "هذا صحيح تمامًا.",
      "في تمام الساعة الثالثة.",
      "مع خالص التحيات.",
      "على طول الطريق.",
      "قال إني بخير.",
      "صافي الدخل الشهري.",
      "مرحبا، هاي.",
      "طعم حلو.",
      "ليس لدي تأمين.",
      "يحتاج إلى فيتامين دي.",
      "تمت التسوية بشكل ودي.",
      "بما في ذلك الأدوية.",
      "يستخدم كراسي متحركة.",
      "يسكن في فيلا.",
      "أجرى كشوف طبية.",
      "اسمها زينة.",
      "هل أنت فاهم؟",
      "أبين لك الخطوات.",
      "على أساس الفحص.",
      "أصوات مكتومة.",
    ];
    for (const s of msa) expect(lockArabicTranslationToMsa(s), s).toBe(s);
  });

  it("still rewrites clear dialect words to فصحى", () => {
    expect(lockArabicTranslationToMsa("أنا مش عارف.")).toBe("أنا لا أعرف.");
    expect(lockArabicTranslationToMsa("ومش عارف.")).toBe("ولا أعرف.");
    expect(lockArabicTranslationToMsa("أنا عايز أروح الحين.")).toBe("أنا أريد أروح الآن.");
    expect(lockArabicTranslationToMsa("ده كويس.")).toBe("هذا جيد.");
    expect(lockArabicTranslationToMsa("أنا فاهم.")).toBe("أنا أفهم.");
    expect(lockArabicTranslationToMsa("ما أقدر أجي.")).toBe("لا أستطيع أجي.");
    expect(lockArabicTranslationToMsa("فين الملف بتاعك؟")).toBe("أين الملف الخاص بك؟");
  });
});
