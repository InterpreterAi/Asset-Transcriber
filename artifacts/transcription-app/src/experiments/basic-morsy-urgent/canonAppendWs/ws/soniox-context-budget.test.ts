import { describe, expect, it } from "vitest";

import { getInterpreterContext } from "./interpreter-context";
import {
  fitSonioxContextToBudget,
  sonioxContextCharLength,
  SONIOX_CONTEXT_MAX_CHARS,
  SONIOX_CONTEXT_SAFE_CHARS,
} from "./soniox-context-budget";

describe("fitSonioxContextToBudget", () => {
  it("trims trailing translation_terms before protected glossary rows", () => {
    const fitted = fitSonioxContextToBudget(
      {
        general: [{ key: "domain", value: "Medical" }],
        terms: Array.from({ length: 400 }, (_, i) => `term_${i}_${"x".repeat(20)}`),
        translation_terms: [
          { source: "glossary", target: "مسرد" },
          ...Array.from({ length: 300 }, (_, i) => ({
            source: `pack_${i}`,
            target: `tgt_${i}_${"y".repeat(30)}`,
          })),
        ],
      },
      { protectedTranslationTermCount: 1, maxChars: 2_000 },
    );
    expect(sonioxContextCharLength(fitted)).toBeLessThanOrEqual(2_000);
    expect(fitted.translation_terms?.[0]).toEqual({ source: "glossary", target: "مسرد" });
  });
});

describe("getInterpreterContext Soniox budget", () => {
  const pairs: [string, string][] = [
    ["en", "ar"],
    ["en", "es"],
    ["es", "ar"],
    ["en", "fr"],
    ["en", "zh-CN"],
    ["ar", "pl"],
    ["en", "pt"],
  ];

  for (const [a, b] of pairs) {
    it(`keeps ${a}↔${b} under Soniox ${SONIOX_CONTEXT_MAX_CHARS}-char limit`, () => {
      const ctx = getInterpreterContext(a, b, [
        { source: "MyClinic", target: "عيادتي" },
      ]);
      const len = sonioxContextCharLength(ctx);
      expect(len).toBeLessThanOrEqual(SONIOX_CONTEXT_SAFE_CHARS);
      expect(len).toBeLessThanOrEqual(SONIOX_CONTEXT_MAX_CHARS);
      // Personal glossary retained when space allows
      expect(
        ctx.translation_terms?.some((t) => t.source === "MyClinic") ?? false,
      ).toBe(true);
    });
  }

  it("does not pin English medical word lists into STT terms for bilingual pairs", () => {
    const ctx = getInterpreterContext("en", "ar");
    expect(ctx.terms).toEqual([]);
  });

  it("still includes vaccine pins for en↔ar when under budget", () => {
    const ctx = getInterpreterContext("en", "ar");
    const blob = JSON.stringify(ctx);
    expect(/MMR|COVID|vaccine|لقاح/i.test(blob)).toBe(true);
  });

  it("pins spoken email punctuation for Soniox-native pairs", () => {
    const ctx = getInterpreterContext("en", "ar");
    expect(ctx.translation_terms?.some((t) => t.source === "dot com" && t.target === ".com")).toBe(true);
    expect(ctx.translation_terms?.some((t) => t.source === "dot" && t.target === ".")).toBe(true);
    expect(ctx.general.some((g) => g.key === "structured_speech")).toBe(true);
  });

  it("does not send register or dialect-rewrite instructions into STT context", () => {
    const ctx = getInterpreterContext("en", "ar");
    expect(ctx.general.some((g) => g.key === "arabic_register")).toBe(false);
    expect(ctx.general.some((g) => g.key === "english_register")).toBe(false);
    expect(ctx.general.some((g) => g.key === "language_register")).toBe(false);
    expect(ctx.general.some((g) => g.key === "speaker_gender")).toBe(false);
  });

  it("keeps a neutral interpreter domain (not English medical STT bias)", () => {
    const ctx = getInterpreterContext("en", "ar");
    expect(ctx.general.some((g) => g.key === "domain" && /medical and legal interpretation/i.test(g.value))).toBe(
      false,
    );
  });
});
