import { describe, expect, it, vi } from "vitest";

import {
  chunkV2GlossaryToSonioxTerms,
  filterGlossaryForLanguagePair,
  resolveRowTranslationDirection,
  fetchChunkV2GlossaryForPair,
  type ChunkV2GlossaryEntry,
} from "./chunk-v2-glossary";
import {
  applyGlossaryPostProcess,
  buildExactPhrasePattern,
  sourcePhraseInOriginal,
} from "./glossary-post-process";

const EN_AR_STRICT: ChunkV2GlossaryEntry = {
  source: "tired",
  target: "تعبااان",
  sourceLanguage: "en",
  targetLanguage: "ar",
  enforceMode: "strict",
  priority: 0,
};

const EN_AR_HINT: ChunkV2GlossaryEntry = {
  ...EN_AR_STRICT,
  enforceMode: "hint",
};

const AR_EN_STRICT: ChunkV2GlossaryEntry = {
  source: "متعب",
  target: "tired",
  sourceLanguage: "ar",
  targetLanguage: "en",
  enforceMode: "strict",
  priority: 0,
};

const FR_ES_STRICT: ChunkV2GlossaryEntry = {
  source: "fatigué",
  target: "cansado",
  sourceLanguage: "fr",
  targetLanguage: "es",
  enforceMode: "strict",
  priority: 0,
};

function post(
  text: string,
  entries: readonly ChunkV2GlossaryEntry[],
  original: string,
  rowSourceLanguage: string,
  langA = "en",
  langB = "ar",
): string {
  return applyGlossaryPostProcess(text, entries, {
    originalText: original,
    rowSourceLanguage,
    langA,
    langB,
  });
}

describe("filterGlossaryForLanguagePair", () => {
  it("includes directed entries for langA→langB and langB→langA only", () => {
    const rows = [
      {
        term: "tired",
        translation: "تعبااان",
        sourceLanguage: "en",
        targetLanguage: "ar",
        enforceMode: "strict",
        priority: 0,
      },
      {
        term: "متعب",
        translation: "tired",
        sourceLanguage: "ar",
        targetLanguage: "en",
        enforceMode: "strict",
        priority: 0,
      },
      {
        term: "fatigué",
        translation: "cansado",
        sourceLanguage: "fr",
        targetLanguage: "es",
        enforceMode: "strict",
        priority: 0,
      },
    ];
    const filtered = filterGlossaryForLanguagePair(rows, "en", "ar");
    expect(filtered.some((e) => e.source === "tired")).toBe(true);
    expect(filtered.some((e) => e.source === "متعب")).toBe(true);
    expect(filtered.some((e) => e.source === "fatigué")).toBe(false);
  });

  it("ignores legacy rows without language metadata", () => {
    const filtered = filterGlossaryForLanguagePair(
      [{ term: "tired", translation: "تعبااان", sourceLanguage: null, targetLanguage: null }],
      "en",
      "ar",
    );
    expect(filtered).toHaveLength(0);
  });

  it("expands comma-separated aliases with shared direction", () => {
    const filtered = filterGlossaryForLanguagePair(
      [
        {
          term: "tired, exhausted",
          translation: "تعبااان",
          sourceLanguage: "en",
          targetLanguage: "ar",
          enforceMode: "strict",
          priority: 1,
        },
      ],
      "en",
      "ar",
    );
    expect(filtered.map((e) => e.source).sort()).toEqual(["exhausted", "tired"]);
    expect(filtered.every((e) => e.sourceLanguage === "en" && e.targetLanguage === "ar")).toBe(true);
  });
});

describe("resolveRowTranslationDirection", () => {
  it("maps row source en to en→ar when pair is en/ar", () => {
    expect(resolveRowTranslationDirection("en", "en", "ar")).toEqual({
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
  });

  it("maps row source ar to ar→en when pair is en/ar", () => {
    expect(resolveRowTranslationDirection("ar", "en", "ar")).toEqual({
      sourceLanguage: "ar",
      targetLanguage: "en",
    });
  });
});

describe("sourcePhraseInOriginal", () => {
  it("matches complete multiword phrase in order", () => {
    expect(sourcePhraseInOriginal("heart attack symptoms", "heart attack")).toBe(true);
  });

  it("does not match scattered words", () => {
    expect(sourcePhraseInOriginal("attack on the heart", "heart attack")).toBe(false);
  });

  it("does not match short substrings inside longer words", () => {
    expect(sourcePhraseInOriginal("retired worker", "tired")).toBe(false);
  });
});

describe("applyGlossaryPostProcess (chunk-v2 conservative)", () => {
  it("1. spoken exact source can use preferred via leak replace", () => {
    const out = post("I am tired today", [EN_AR_STRICT], "I am tired today", "en");
    expect(out).toBe("I am تعبااان today");
  });

  it("2. unspoken source never changes translation", () => {
    const out = post("I feel weary", [EN_AR_STRICT], "I feel weary", "en");
    expect(out).toBe("I feel weary");
  });

  it("3. preferred term is never appended", () => {
    const out = post("I am weary", [EN_AR_STRICT], "I am tired", "en");
    expect(out).not.toMatch(/تعبااان\s*$/);
    expect(out).not.toContain("تعبااان");
  });

  it("4. does not duplicate normal translation and preferred term", () => {
    const out = post("بالتعب", [EN_AR_STRICT], "I am tired", "en");
    expect(out).toBe("بالتعب");
    expect(out.match(/تعبااان/g)?.length ?? 0).toBe(0);
  });

  it("5. glossary for another language pair has no effect", () => {
    const out = post("je suis fatigué", [FR_ES_STRICT], "je suis fatigué", "fr", "en", "ar");
    expect(out).toBe("je suis fatigué");
  });

  it("6. reverse-direction entry has no effect on wrong direction", () => {
    const out = post("I am tired", [AR_EN_STRICT], "I am tired", "en", "en", "ar");
    expect(out).toBe("I am tired");
  });

  it("7. complete multiword phrase matches", () => {
    const entry: ChunkV2GlossaryEntry = {
      source: "heart attack",
      target: "نوبة قلبية",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    expect(sourcePhraseInOriginal("had a heart attack yesterday", "heart attack")).toBe(true);
    const out = post("had a heart attack leak", [entry], "had a heart attack yesterday", "en");
    expect(out).toBe("had a نوبة قلبية leak");
  });

  it("8. same words scattered separately do not match", () => {
    const entry: ChunkV2GlossaryEntry = {
      source: "heart attack",
      target: "نوبة قلبية",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    const out = post("attack on heart", [entry], "attack on heart", "en");
    expect(out).toBe("attack on heart");
  });

  it("9. short substrings do not match inside longer words", () => {
    expect(sourcePhraseInOriginal("retired", "tired")).toBe(false);
    const out = post("retired", [EN_AR_STRICT], "retired", "en");
    expect(out).toBe("retired");
  });

  it("10. unrelated Arabic words sharing a root are not replaced", () => {
    const out = post("متعب جدا", [EN_AR_STRICT], "I am tired", "en");
    expect(out).toBe("متعب جدا");
  });

  it("11. interim source absent from finalized Original has no effect when Original empty", () => {
    const out = post("tired", [EN_AR_STRICT], "", "en");
    expect(out).toBe("tired");
  });

  it("12. hint entries are not enforced client-side", () => {
    const out = post("I am tired", [EN_AR_HINT], "I am tired", "en");
    expect(out).toBe("I am tired");
  });

  it("13. strict entries replace exact leaked source occurrence", () => {
    const out = post("tired", [EN_AR_STRICT], "tired", "en");
    expect(out).toBe("تعبااان");
  });

  it("14. finalized post-process output is authoritative over longer corrupted live text", () => {
    const corruptedLive = "I am tired تعبااان";
    const sonioxFinal = "I am tired";
    const corrected = post(sonioxFinal, [EN_AR_STRICT], "I am tired", "en");
    expect(corrected.length).toBeLessThan(corruptedLive.length);
    expect(corrected).toBe("I am تعبااان");
  });

  it("normalizes exact preferred variant without appending duplicates", () => {
    const entry: ChunkV2GlossaryEntry = {
      source: "tired",
      target: "TIRED",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    const out = post("tired", [entry], "tired", "en");
    expect(out).toBe("TIRED");
  });
});

describe("chunkV2GlossaryToSonioxTerms", () => {
  it("includes hint and strict rows for Soniox translation_terms", () => {
    const terms = chunkV2GlossaryToSonioxTerms([EN_AR_STRICT, EN_AR_HINT]);
    expect(terms).toEqual([{ source: "tired", target: "تعبااان" }]);
  });
});

describe("fetchChunkV2GlossaryForPair", () => {
  it("16. fetch failure returns empty list without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(fetchChunkV2GlossaryForPair("en", "ar")).resolves.toEqual([]);
    vi.unstubAllGlobals();
  });

  it("returns filtered entries on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          entries: [
            {
              term: "tired",
              translation: "تعبااان",
              sourceLanguage: "en",
              targetLanguage: "ar",
              enforceMode: "strict",
            },
          ],
        }),
      }),
    );
    const rows = await fetchChunkV2GlossaryForPair("en", "ar");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("tired");
    vi.unstubAllGlobals();
  });
});

describe("buildExactPhrasePattern", () => {
  it("is case-insensitive for ASCII", () => {
    const re = buildExactPhrasePattern("Tired");
    expect(re.test("i am TIRED today")).toBe(true);
  });
});
