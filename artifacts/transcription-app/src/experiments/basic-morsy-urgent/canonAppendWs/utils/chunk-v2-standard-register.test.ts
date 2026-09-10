import { describe, expect, it } from "vitest";

import { applyGlossaryPostProcess } from "./glossary-post-process";
import { normalizeChunkV2StandardRegister } from "./chunk-v2-standard-register";
import type { ChunkV2GlossaryEntry } from "./chunk-v2-glossary";

describe("normalizeChunkV2StandardRegister", () => {
  it("rewrites Arabic dialect particles to MSA on en→ar", () => {
    const out = normalizeChunkV2StandardRegister("نعم ليش أنا متعب عشان كده", {
      rowSourceLanguage: "en",
      langA: "en",
      langB: "ar",
    });
    expect(out).toContain("لماذا");
    expect(out).toContain("لأن");
    expect(out).toContain("هكذا");
    expect(out).not.toContain("ليش");
    expect(out).not.toContain("عشان");
    expect(out).not.toContain("كده");
  });

  it("rewrites Maghrebi particles to MSA on en→ar", () => {
    const out = normalizeChunkV2StandardRegister("واش علاش صافي باركا", {
      rowSourceLanguage: "en",
      langA: "en",
      langB: "ar",
    });
    expect(out).toContain("هل");
    expect(out).toContain("لماذا");
    expect(out).toContain("حسنا");
    expect(out).toContain("يكفي");
    expect(out).not.toContain("واش");
    expect(out).not.toContain("علاش");
    expect(out).not.toContain("صافي");
    expect(out).not.toContain("باركا");
  });

  it("rewrites Egyptian clinical dialect phrases to MSA on en→ar", () => {
    const out = normalizeChunkV2StandardRegister(
      "كويس خليني أشوف الخشم ده بيتكلم مش قوي",
      {
        rowSourceLanguage: "en",
        langA: "en",
        langB: "ar",
      },
    );
    expect(out).toContain("جيد");
    expect(out).toContain("دعني");
    expect(out).toContain("الأنف");
    expect(out).toContain("هذا");
    expect(out).toContain("يتحدث");
    expect(out).toContain("ليس");
    expect(out).not.toContain("كويس");
    expect(out).not.toContain("خليني");
    expect(out).not.toContain("الخشم");
    expect(out).not.toContain("بيتكلم");
    expect(out).not.toMatch(/(?<![\u0600-\u06FF])ده(?![\u0600-\u06FF])/);
    expect(out).not.toMatch(/(?<![\u0600-\u06FF])مش(?![\u0600-\u06FF])/);
  });

  it("does not rewrite Arabic originals when the translation target is English", () => {
    const dialect = "ليش أنا تعبان";
    const out = normalizeChunkV2StandardRegister(dialect, {
      rowSourceLanguage: "ar",
      langA: "en",
      langB: "ar",
    });
    expect(out).toBe(dialect);
  });

  it("rewrites English slang when translating to English", () => {
    const out = normalizeChunkV2StandardRegister("I gonna wait", {
      rowSourceLanguage: "ar",
      langA: "en",
      langB: "ar",
    });
    expect(out).toBe("I going to wait");
  });

  it("leaves glossary preferred dialect wording untouched", () => {
    const out = normalizeChunkV2StandardRegister("نعم ليش اليوم", {
      rowSourceLanguage: "en",
      langA: "en",
      langB: "ar",
      protectedPhrases: ["ليش"],
    });
    expect(out).toContain("ليش");
    expect(out).not.toContain("لماذا");
  });
});

describe("applyGlossaryPostProcess register polish (translation only)", () => {
  it("rewrites dialect particles in the translation column to الفصحى", () => {
    const out = applyGlossaryPostProcess(
      "نعم فين العيادة",
      [],
      {
        originalText: "Yes, where is the clinic",
        rowSourceLanguage: "en",
        langA: "en",
        langB: "ar",
      },
    );
    expect(out).toContain("أين");
    expect(out).not.toContain("فين");
  });

  it("leaves Arabic dialect alone when that text is treated as non-ar target", () => {
    // ar→en: translation target is English — Arabic particles must not be rewritten.
    const dialect = "ليش أنا تعبان";
    const out = applyGlossaryPostProcess(dialect, [], {
      originalText: dialect,
      rowSourceLanguage: "ar",
      langA: "en",
      langB: "ar",
    });
    expect(out).toBe(dialect);
  });
});
