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

describe("applyGlossaryPostProcess register polish (restored: disabled)", () => {
  it("does not rewrite MSA/dialect on the restored path", () => {
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
    expect(out).toBe("نعم فين العيادة");
  });
});
