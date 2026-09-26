import { describe, expect, it } from "vitest";
import { applyExactGlossaryPins } from "./pin-translation";

const SONO = { source: "Sonogram", target: "تصوير بالموجات فوق الصوتية" };
const WBV = { source: "WBV", target: "مؤشر كريات الدم البيضاء" };
const MRI = { source: "MRI", target: "تصوير بالرنين المغناطيسي" };

describe("exact glossary pins", () => {
  it("replaces an English echo with the exact Arabic term", () => {
    const out = applyExactGlossaryPins(
      "Sure, but you're going to need to do a Sonogram.",
      "أكيد، لكنك ستحتاج إلى إجراء تصوير صوتي Sonogram.",
      [SONO],
    );
    expect(out).toContain("تصوير بالموجات فوق الصوتية");
    expect(out).not.toMatch(/Sonogram/i);
  });

  it("does not leave WBV in the Arabic translation", () => {
    const out = applyExactGlossaryPins(
      "Oh yeah, how about her WBV?",
      "آه نعم، ماذا عن مؤشر كريات الدم البيضاء WBV لديها؟",
      [WBV],
    );
    expect(out).toContain("مؤشر كريات الدم البيضاء");
    expect(out).not.toMatch(/\bWBV\b/);
  });

  it("uses the exact target when the original is only that term", () => {
    expect(applyExactGlossaryPins("Sonogram", "تصوير صوتي", [SONO])).toBe(SONO.target);
    expect(applyExactGlossaryPins("MRI", "أشعة", [MRI])).toBe(MRI.target);
  });

  it("pins Arabic original to the English term", () => {
    const out = applyExactGlossaryPins(
      "تصوير بالموجات فوق الصوتية",
      "an ultrasound scan",
      [{ source: "تصوير بالموجات فوق الصوتية", target: "Sonogram" }],
    );
    expect(out).toBe("Sonogram");
  });

  it("does not rewrite the translation when the original never said the term", () => {
    const out = applyExactGlossaryPins(
      "She needs to rest today.",
      "إنها تحتاج إلى الراحة اليوم.",
      [SONO, MRI],
    );
    expect(out).toBe("إنها تحتاج إلى الراحة اليوم.");
  });

  it("replaces an English echo with the exact Spanish term", () => {
    const sonoEs = { source: "Sonogram", target: "ecografía" };
    const out = applyExactGlossaryPins(
      "You're going to need a Sonogram.",
      "Va a necesitar una ecografía Sonogram.",
      [sonoEs],
    );
    expect(out).toContain("ecografía");
    expect(out).not.toMatch(/Sonogram/i);
  });

  it("pins Spanish original to the English term", () => {
    expect(
      applyExactGlossaryPins("ecografía", "an ultrasound scan", [
        { source: "ecografía", target: "Sonogram" },
      ]),
    ).toBe("Sonogram");
  });

  it("replaces an English echo with the exact Polish term", () => {
    const sonoPl = { source: "Sonogram", target: "ultrasonografia" };
    const out = applyExactGlossaryPins(
      "You're going to need a Sonogram.",
      "Będzie pani potrzebować Sonogram.",
      [sonoPl],
    );
    expect(out).toContain("ultrasonografia");
    expect(out).not.toMatch(/Sonogram/i);
  });

  it("fixes Soniox swapping esophagus for appendix when Original said المريء", () => {
    const pairs = [
      { source: "المريء", target: "Esophagus" },
      { source: "Esophagus", target: "المريء" },
      { source: "الزائدة الدودية", target: "Appendix" },
      { source: "Appendix", target: "الزائدة الدودية" },
    ];
    const out = applyExactGlossaryPins(
      "وماذا عن المريء؟ أي الأخبار؟",
      "And what about the appendix?",
      pairs,
    );
    expect(out).toMatch(/esophagus/i);
    expect(out).not.toMatch(/appendix/i);
  });

  it("does not steal appendix when the original also said الزائدة الدودية", () => {
    const pairs = [
      { source: "المريء", target: "Esophagus" },
      { source: "الزائدة الدودية", target: "Appendix" },
    ];
    const out = applyExactGlossaryPins(
      "المريء والزائدة الدودية",
      "the esophagus and the appendix",
      pairs,
    );
    expect(out).toMatch(/esophagus/i);
    expect(out).toMatch(/appendix/i);
  });

  it("pins short Arabic glossary stems (2–3 letters)", () => {
    expect(applyExactGlossaryPins("زب", "Zip.", [{ source: "زب", target: "dick" }])).toBe("dick");
    expect(applyExactGlossaryPins("خرا", "Fuck.", [{ source: "خرا", target: "shit" }])).toBe("shit");
  });

  it("matches Arabic stems with possessive clitics on the original", () => {
    const pairs = [
      { source: "كسّ", target: "pussy" },
      { source: "pussy", target: "كسّ" },
    ];
    const out = applyExactGlossaryPins("كسّك", "your cut", pairs);
    expect(out).toMatch(/pussy/i);
  });
});
