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

describe("getInterpreterContext Soniox budget (tight 7.5k operating cap)", () => {
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
      expect(
        ctx.translation_terms?.some((t) => t.source === "MyClinic") ?? false,
      ).toBe(true);
    });
  }

  it("uses official short Soniox general keys and does not send context.text", () => {
    const ctx = getInterpreterContext("en", "ar");
    const keys = ctx.general.map((g) => g.key);
    expect(keys).toContain("domain");
    expect(keys).toContain("topic");
    expect(keys).toContain("setting");
    expect(keys).toContain("speakers");
    expect(keys).toContain("instructions");
    expect(keys).toContain("language");
    expect(ctx.general.length).toBeLessThanOrEqual(10);
    expect(ctx.general.every((g) => g.value.length <= 320)).toBe(true);
    expect((ctx as { text?: string }).text).toBeUndefined();
    expect(ctx.terms.length).toBeGreaterThan(0);
    expect(ctx.translation_terms?.some((t) => t.source === "interpreter")).toBe(true);
  });
});
