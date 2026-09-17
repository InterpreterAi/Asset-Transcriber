import { describe, expect, it } from "vitest";
import { buildStableDialectContext } from "./stable-dialect-context";
import {
  englishPivotPairKey,
  mergeSonioxXInterpreterContext,
  packTermsForPair,
  userGlossaryToTerms,
  SONIOX_X_CONTEXT_SAFE_CHARS,
} from "./interpreter-glossary";

describe("interpreter glossary", () => {
  it("uses English as the pivot pair key", () => {
    expect(englishPivotPairKey("ar", "en")).toBe("en-ar");
    expect(englishPivotPairKey("en", "nl")).toBe("en-nl");
    expect(englishPivotPairKey("fr", "de")).toBeNull();
  });

  it("turns user glossary rows into both translation directions", () => {
    const terms = userGlossaryToTerms(
      [{ term: "MRI", translation: "الرنين المغناطيسي", sourceLanguage: "en", targetLanguage: "ar" }],
      "en",
      "ar",
    );
    expect(terms).toEqual([
      { source: "MRI", target: "الرنين المغناطيسي" },
      { source: "الرنين المغناطيسي", target: "MRI" },
    ]);
  });

  it("keeps merged context under the Soniox 10k-char budget", () => {
    const dialect = buildStableDialectContext("en", "ar");
    const pack = packTermsForPair("en", "ar");
    const ctx = mergeSonioxXInterpreterContext({
      dialect,
      packTerms: pack.translationTerms,
      packPins: pack.recognitionPins,
      packLines: pack.glossaryLines,
      userTerms: [{ source: "MRI", target: "الرنين المغناطيسي" }],
      langA: "en",
      langB: "ar",
    });
    expect(JSON.stringify(ctx).length).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    expect(ctx.translation_terms?.some((t) => t.source === "MRI")).toBe(true);
    expect(ctx.translation_terms?.some((t) => t.target === "MRI")).toBe(true);
    expect(ctx.terms?.some((t) => /you're through to the Arabic interpreter/i.test(t))).toBe(true);
    expect(ctx.general?.some((kv) => kv.key === "call_opening" && /UR3/i.test(kv.value))).toBe(true);
    expect(ctx.general?.find((kv) => kv.key === "domain")?.value).toMatch(/Telephone and video interpreting/i);
    expect(ctx.general?.find((kv) => kv.key === "domain")?.value).not.toMatch(/^Healthcare interpretation$/i);
  });

  it("loads the en-ar medical pack both directions", () => {
    const pack = packTermsForPair("en", "ar");
    expect(pack.translationTerms.some((t) => t.source === "CPR" && t.target === "الإنعاش القلبي الرئوي")).toBe(
      true,
    );
    expect(pack.translationTerms.some((t) => t.source === "الإنعاش القلبي الرئوي" && t.target === "CPR")).toBe(
      true,
    );
    expect(pack.glossaryLines.length).toBeGreaterThan(400);
  });

  it("pins high-value medical abbreviations inside the Soniox budget", () => {
    const dialect = buildStableDialectContext("en", "ar");
    const pack = packTermsForPair("en", "ar");
    const ctx = mergeSonioxXInterpreterContext({
      dialect,
      packTerms: pack.translationTerms,
      packPins: pack.recognitionPins,
      packLines: pack.glossaryLines,
      userTerms: [],
      langA: "en",
      langB: "ar",
    });
    const n = JSON.stringify(ctx).length;
    expect(n).toBeGreaterThan(8_000);
    expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    for (const en of ["CPR", "MRI", "ECG", "IUD", "Stroke", "Sonogram"] as const) {
      const ok =
        ctx.translation_terms?.some((t) => t.source === en) || (ctx.text ?? "").includes(`${en}=`);
      expect(ok, `${en} missing; chars=${n}`).toBe(true);
    }
    const sono = ctx.translation_terms?.find((t) => t.source === "Sonogram");
    expect(sono?.target).toBe("تصوير بالموجات فوق الصوتية");
    expect(sono?.target ?? "").not.toMatch(/sonogram/i);
    expect(ctx.terms?.includes("بزاف")).toBe(true);
    expect(ctx.terms?.some((t) => /you are through to the Arabic interpreter/i.test(t))).toBe(true);
    expect(JSON.stringify(ctx)).toMatch(/Yemeni/);
  });

  it("loads the en-es medical pack both directions", () => {
    const pack = packTermsForPair("en", "es");
    expect(pack.translationTerms.some((t) => t.source === "CPR" && t.target === "reanimación cardiopulmonar")).toBe(
      true,
    );
    expect(pack.translationTerms.some((t) => t.source === "reanimación cardiopulmonar" && t.target === "CPR")).toBe(
      true,
    );
    expect(pack.glossaryLines.length).toBeGreaterThan(400);
  });

  it("pins high-value Spanish medical terms inside the Soniox budget", () => {
    const dialect = buildStableDialectContext("en", "es");
    const pack = packTermsForPair("en", "es");
    const ctx = mergeSonioxXInterpreterContext({
      dialect,
      packTerms: pack.translationTerms,
      packPins: pack.recognitionPins,
      packLines: pack.glossaryLines,
      userTerms: [],
      langA: "en",
      langB: "es",
    });
    const n = JSON.stringify(ctx).length;
    expect(n).toBeGreaterThan(8_000);
    expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    for (const en of ["CPR", "MRI", "ECG", "IUD", "Stroke", "Sonogram"] as const) {
      expect(
        ctx.translation_terms?.some((t) => t.source === en) || (ctx.text ?? "").includes(`${en}=`),
      ).toBe(true);
    }
    const sono = ctx.translation_terms?.find((t) => t.source === "Sonogram");
    expect(sono?.target).toBe("ecografía");
    expect(sono?.target ?? "").not.toMatch(/sonogram/i);
    expect(ctx.text).toMatch(/español estándar/i);
    expect(ctx.terms?.some((t) => /you're through to the Spanish interpreter/i.test(t))).toBe(true);
    expect(ctx.terms?.some((t) => /Arabic interpreter/i.test(t))).toBe(true);
  });

  it("loads the en-pl medical pack both directions", () => {
    const pack = packTermsForPair("en", "pl");
    expect(pack.translationTerms.some((t) => t.source === "CPR" && t.target === "resuscytacja krążeniowo-oddechowa")).toBe(
      true,
    );
    expect(
      pack.translationTerms.some((t) => t.source === "resuscytacja krążeniowo-oddechowa" && t.target === "CPR"),
    ).toBe(true);
    expect(pack.glossaryLines.length).toBeGreaterThan(400);
  });

  it("pins high-value Polish medical terms inside the Soniox budget", () => {
    const dialect = buildStableDialectContext("en", "pl");
    const pack = packTermsForPair("en", "pl");
    const ctx = mergeSonioxXInterpreterContext({
      dialect,
      packTerms: pack.translationTerms,
      packPins: pack.recognitionPins,
      packLines: pack.glossaryLines,
      userTerms: [],
      langA: "en",
      langB: "pl",
    });
    const n = JSON.stringify(ctx).length;
    expect(n).toBeGreaterThan(8_000);
    expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    for (const en of ["CPR", "MRI", "ECG", "IUD", "Stroke", "Sonogram"] as const) {
      expect(
        ctx.translation_terms?.some((t) => t.source === en) || (ctx.text ?? "").includes(`${en}=`),
      ).toBe(true);
    }
    const sono = ctx.translation_terms?.find((t) => t.source === "Sonogram");
    expect(sono?.target).toBe("ultrasonografia");
    expect(sono?.target ?? "").not.toMatch(/sonogram/i);
    expect(ctx.text).toMatch(/ogólnopolski|polszczyzna/i);
  });
});
