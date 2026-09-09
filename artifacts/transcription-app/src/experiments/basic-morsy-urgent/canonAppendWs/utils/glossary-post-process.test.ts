/**
 * Restored chunk-v2 path: client-side glossary force is disabled.
 * Upstream Soniox translation_terms still carry saved glossary entries.
 */
import { describe, expect, it } from "vitest";

import { applyGlossaryPostProcess } from "./glossary-post-process";
import {
  chunkV2GlossaryToSonioxTerms,
  filterGlossaryForLanguagePair,
  type ChunkV2GlossaryEntry,
} from "./chunk-v2-glossary";

describe("applyGlossaryPostProcess (restored: no client force)", () => {
  it("returns Soniox translation text unchanged", () => {
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

  it("ignores empty / missing terms without throwing", () => {
    expect(applyGlossaryPostProcess("ok", [])).toBe("ok");
    expect(applyGlossaryPostProcess("ok")).toBe("ok");
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
