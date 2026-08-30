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

describe("applyGlossaryPostProcess register polish", () => {
  it("still forces MSA when the glossary is empty", () => {
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

  it("applies MSA after glossary force", () => {
    const entry: ChunkV2GlossaryEntry = {
      source: "tired",
      target: "متعب",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    const out = applyGlossaryPostProcess(
      "أنا tired ليش",
      [entry],
      {
        originalText: "I am tired why",
        rowSourceLanguage: "en",
        langA: "en",
        langB: "ar",
      },
    );
    expect(out).toContain("متعب");
    expect(out).toContain("لماذا");
    expect(out.toLowerCase()).not.toContain("tired");
    expect(out).not.toContain("ليش");
  });
});
