/**
 * Chunk-v2: no client glossary force; translation-only official register polish.
 */
import { describe, expect, it } from "vitest";

import { applyGlossaryPostProcess } from "./glossary-post-process";
import {
  chunkV2GlossaryToSonioxTerms,
  filterGlossaryForLanguagePair,
  type ChunkV2GlossaryEntry,
} from "./chunk-v2-glossary";

describe("applyGlossaryPostProcess", () => {
  it("does not force-replace glossary aliases client-side", () => {
    const entry: ChunkV2GlossaryEntry = {
      source: "tired",
      target: "مرهق",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    expect(applyGlossaryPostProcess("I am weary", [entry], { originalText: "I am tired" })).toBe(
      "I am weary",
    );
  });

  it("locks Arabic dialect particles to الفصحى on en→ar translation only", () => {
    const out = applyGlossaryPostProcess(
      "نعم ليش أنا متعب فين العيادة",
      [],
      {
        originalText: "Yes why am I tired where is the clinic",
        rowSourceLanguage: "en",
        langA: "en",
        langB: "ar",
      },
    );
    expect(out).toContain("لماذا");
    expect(out).toContain("أين");
    expect(out).not.toContain("ليش");
    expect(out).not.toContain("فين");
  });

  it("does not rewrite when direction opts are missing", () => {
    expect(applyGlossaryPostProcess("نعم فين العيادة", [])).toBe("نعم فين العيادة");
  });

  it("ignores empty / missing terms without throwing", () => {
    expect(applyGlossaryPostProcess("ok", [])).toBe("ok");
    expect(applyGlossaryPostProcess("ok")).toBe("ok");
  });

  it("repairs cholesterol→فقر الدم when original proves cholesterol", () => {
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

describe("upstream glossary helpers still available", () => {
  it("chunkV2GlossaryToSonioxTerms keeps saved entries for Soniox context", () => {
    const terms = chunkV2GlossaryToSonioxTerms([
      {
        source: "stroke",
        target: "سكتة",
        sourceLanguage: "en",
        targetLanguage: "ar",
        enforceMode: "strict",
        priority: 1,
      },
    ]);
    expect(terms).toEqual([{ source: "stroke", target: "سكتة" }]);
  });

  it("filterGlossaryForLanguagePair still filters by pair", () => {
    const rows = filterGlossaryForLanguagePair(
      [
        {
          term: "hello",
          translation: "hola",
          sourceLanguage: "en",
          targetLanguage: "es",
        },
        {
          term: "bye",
          translation: "adios",
          sourceLanguage: "fr",
          targetLanguage: "es",
        },
      ],
      "en",
      "es",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("hello");
  });
});
