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
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.source).toBe("tired");
    expect(filtered[0]?.sourceLanguage).toBe("en");
    expect(filtered[0]?.targetLanguage).toBe("ar");
  });

  it("accepts snake_case language fields from API payloads", () => {
    const filtered = filterGlossaryForLanguagePair(
      [
        {
          term: "tired",
          translation: "تعبااان",
          source_language: "en",
          target_language: "ar",
          enforce_mode: "strict",
        },
      ],
      "en",
      "ar",
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.source).toBe("tired");
    expect(filtered[0]?.sourceLanguage).toBe("en");
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

describe("applyGlossaryPostProcess (chunk-v2 force preferred)", () => {
  it("1. spoken exact source replaces leaked source with preferred", () => {
    const out = post("I am tired today", [EN_AR_STRICT], "I am tired today", "en");
    expect(out).toBe("I am تعبااان today");
  });

  it("2. unspoken source never changes translation", () => {
    const out = post("I feel weary", [EN_AR_STRICT], "I feel weary", "en");
    expect(out).toBe("I feel weary");
  });

  it("3. forces preferred when source spoken even if Soniox used another word", () => {
    const out = post("I am weary", [EN_AR_STRICT], "I am tired", "en");
    expect(out).toContain("تعبااان");
  });

  it("4. forces preferred spelling when Soniox used Arabic cognate/clitic form", () => {
    const out = post("بالتعب", [EN_AR_STRICT], "I am tired", "en");
    expect(out).toContain("تعبااان");
    expect(out.match(/تعبااان/g)?.length).toBe(1);
  });

  it("5. glossary for another language pair has no effect", () => {
    const out = post("je suis fatigué", [FR_ES_STRICT], "je suis fatigué", "fr", "en", "ar");
    expect(out).toBe("je suis fatigué");
  });

  it("6. reverse-direction entry does not fire until the Arabic source is spoken", () => {
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

  it("10. replaces Arabic MT cognate in-place when stem is related (متعب → preferred)", () => {
    const out = post("أنا متعب جدا", [EN_AR_STRICT], "I am tired", "en");
    expect(out).toBe("أنا تعبااان جدا");
    expect(out.match(/تعبااان/g)?.length).toBe(1);
  });

  it("10b. forces preferred when Soniox LID mismatches pair but source is in Original", () => {
    // LID said "fr" but Original is English with en→ar entry — still force.
    const out = post("أنا متعب", [EN_AR_STRICT], "I am tired", "fr", "en", "ar");
    expect(out).toContain("تعبااان");
  });

  it("11. leaked source in the translation column is replaced even before Original lands", () => {
    const out = post("tired", [EN_AR_STRICT], "", "en");
    expect(out).toBe("تعبااان");
  });

  it("12. hint entries are also forced on Soniox-native output", () => {
    const out = post("I am tired", [EN_AR_HINT], "I am tired", "en");
    expect(out).toBe("I am تعبااان");
  });

  it("13. strict entries replace exact leaked source / only-source Original", () => {
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

  it("15. forces nonsense preferred when testing glossary (any wrong saved target)", () => {
    const entry: ChunkV2GlossaryEntry = {
      source: "tired",
      target: "ZZZPREF",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    expect(post("أنا متعب", [entry], "tired", "en")).toBe("ZZZPREF");
    expect(post("أنا متعب", [entry], "I am tired", "en")).toContain("ZZZPREF");
  });

  it("16. Arabic → English force on reverse direction", () => {
    expect(post("I feel weary", [AR_EN_STRICT], "متعب", "ar", "en", "ar")).toBe("tired");
    expect(post("I feel weary", [AR_EN_STRICT], "انا متعب", "ar", "en", "ar")).toContain("tired");
    // Wrong direction (English row) ignores Arabic→English entry
    expect(post("I am tired", [AR_EN_STRICT], "I am tired", "en", "en", "ar")).toBe("I am tired");
  });

  it("17. French → Spanish force for non-English pair", () => {
    const out = post("estoy agotado", [FR_ES_STRICT], "fatigué", "fr", "fr", "es");
    expect(out).toBe("cansado");
  });

  it("18. English → Spanish force", () => {
    const entry: ChunkV2GlossaryEntry = {
      source: "claim number",
      target: "número de reclamo",
      sourceLanguage: "en",
      targetLanguage: "es",
      enforceMode: "strict",
      priority: 0,
    };
    const out = post("el folio es 12", [entry], "claim number is 12", "en", "en", "es");
    expect(out).toContain("número de reclamo");
  });

  it("18b. English leaks in Arabic stay replaced even if a reverse row exists", () => {
    const biopsy: ChunkV2GlossaryEntry = {
      source: "biopsy",
      target: "خزعة",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    const reverseTired: ChunkV2GlossaryEntry = {
      source: "تعبااان",
      target: "tired",
      sourceLanguage: "ar",
      targetLanguage: "en",
      enforceMode: "strict",
      priority: 0,
    };
    const tiredOut = post(
      "نعم، مرحبا، فقط أشعر أنني tired اليوم. لا أعرف لماذا، لكن.",
      [EN_AR_STRICT, reverseTired],
      "Yes, hi, it's just that I've been feeling tired today. I don't know why, but.",
      "en",
    );
    expect(tiredOut).toContain("تعبااان");
    expect(tiredOut.toLowerCase()).not.toContain("tired");

    const biopsyOut = post(
      "نعم، هناك biopsy أن أجري خزعة.",
      [biopsy, reverseTired],
      "Yeah, there I have to take a biopsy.",
      "en",
    );
    expect(biopsyOut).toContain("خزعة");
    expect(biopsyOut.toLowerCase()).not.toContain("biopsy");
  });

  it("19. replaces the wrong translated word the user saved as the term", () => {
    const entry: ChunkV2GlossaryEntry = {
      source: "مرهق",
      target: "تعبااان",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    expect(post("أنا مرهق اليوم", [entry], "I feel weary", "en")).toBe("أنا تعبااان اليوم");
  });

  it("20. replaces the primary wrong Soniox word instead of appending", () => {
    const out = post("أنا مرهق اليوم", [EN_AR_STRICT], "I am tired today", "en");
    expect(out).toBe("أنا تعبااان اليوم");
    expect(out.includes("مرهق")).toBe(false);
  });

  it("21. does not paste a glossary term onto an unrelated word in the same sentence", () => {
    const pussy: ChunkV2GlossaryEntry = {
      source: "pussy",
      target: "كس",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    const out = post(
      "وماذا عن تنظير القولون؟ وماذا عن قضيبي؟",
      [pussy],
      "How about the colonoscopy? How about my pussy?",
      "en",
    );
    expect(out).toContain("كس");
    expect(out).toContain("تنظير");
    expect(out).toContain("القولون");
    expect(out).not.toContain("تنظير كس");
    expect(out).not.toContain("قضيبي");
    expect((out.match(/كس/g) ?? []).length).toBe(1);
  });

  it("22. inserts a nonsense glossary target only once when the source was said once", () => {
    const biopsy: ChunkV2GlossaryEntry = {
      source: "biopsy",
      target: "خززههع",
      sourceLanguage: "en",
      targetLanguage: "ar",
      enforceMode: "strict",
      priority: 0,
    };
    const out = post(
      "نعم، إنها فقط biopsy التي قمتُ بفحصها الأسبوع الماضي.",
      [biopsy],
      "Yes, it's just the biopsy that I've checked last week.",
      "en",
    );
    expect(out).toContain("خززههع");
    expect(out.toLowerCase()).not.toContain("biopsy");
    expect((out.match(/خززههع/g) ?? []).length).toBe(1);
    expect(out).toContain("فحص");
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
