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

  it("still includes vaccine pins for en↔ar when under budget", () => {
    const ctx = getInterpreterContext("en", "ar");
    const blob = JSON.stringify(ctx);
    expect(/MMR|COVID|vaccine|لقاح/i.test(blob)).toBe(true);
  });

  it("asks Soniox to transcribe verbatim and pins SNAP/EBT/RSDI for en↔ar", () => {
    const ctx = getInterpreterContext("en", "ar");
    expect(ctx.general.some((g) => g.key === "domain" && g.value === "Professional interpretation")).toBe(
      true,
    );
    expect(ctx.general.some((g) => g.key === "speakers" && g.value === "2 speakers")).toBe(true);
    expect(
      ctx.general.some(
        (g) => g.key === "instructions" && /Transcribe exactly what is spoken/i.test(g.value),
      ),
    ).toBe(true);
    expect(ctx.general.some((g) => g.key === "no_invented_words")).toBe(false);
    expect(ctx.general.some((g) => g.key === "full_phrase_meaning")).toBe(false);
    expect(ctx.terms.some((t) => t === "SNAP")).toBe(true);
    expect(ctx.terms.some((t) => t === "disabled")).toBe(true);
    expect(ctx.terms.some((t) => t === "RSDI")).toBe(true);
    expect(
      ctx.translation_terms?.some((t) => t.source === "SNAP" && /مساعدة غذائية|المساعدة الغذائية/.test(t.target)),
    ).toBe(true);
    expect(
      ctx.translation_terms?.some((t) => t.source === "checking account" && t.target === "حساب جاري"),
    ).toBe(true);
  });
});
