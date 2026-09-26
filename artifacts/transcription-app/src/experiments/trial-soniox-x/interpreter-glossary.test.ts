import { describe, expect, it } from "vitest";
import { buildStableDialectContext } from "./stable-dialect-context";
import {
  englishPivotPairKey,
  mergeSonioxXInterpreterContext,
  packTermsForPair,
  userGlossaryToTerms,
  SONIOX_X_CONTEXT_SAFE_CHARS,
  SONIOX_X_JA_CONTEXT_SAFE_CHARS,
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
    expect(n).toBeGreaterThan(7_500);
    expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    for (const en of ["CPR", "MRI", "Sonogram"] as const) {
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

  it("loads the enlarged en-pt pack both directions without changing other pairs", () => {
    const pt = packTermsForPair("en", "pt");
    expect(pt.glossaryLines.length).toBeGreaterThan(1000);
    expect(pt.translationTerms.some((t) => t.source === "Immigration status" && t.target === "status migratório")).toBe(
      true,
    );
    expect(pt.translationTerms.some((t) => t.source === "CPR" && t.target === "RCP")).toBe(true);
    expect(pt.translationTerms.some((t) => t.source === "RCP" && t.target === "CPR")).toBe(true);
    expect(pt.translationTerms.some((t) => t.source === "Abdominal Pain" && /dor abdominal/i.test(t.target))).toBe(
      true,
    );
    expect(pt.translationTerms.some((t) => t.source === "alimony" && /pensão/i.test(t.target))).toBe(true);
    expect(pt.translationTerms.some((t) => t.source === "Accident claim")).toBe(true);
    // Other pairs must stay in their catalog ballpark (PT-only Excel merge + safe cross-fill).
    expect(packTermsForPair("en", "es").glossaryLines.length).toBeGreaterThan(400);
    expect(packTermsForPair("en", "es").glossaryLines.length).toBeLessThan(1200);
    expect(packTermsForPair("en", "ar").glossaryLines.length).toBeGreaterThan(400);
    expect(packTermsForPair("en", "ar").glossaryLines.length).toBeLessThan(1200);
    expect(packTermsForPair("en", "ja").glossaryLines.length).toBeGreaterThan(400);
    expect(packTermsForPair("en", "ja").glossaryLines.length).toBeLessThan(1200);
  });

  it("loads the en-fr pack both directions like other priority pairs", () => {
    const pack = packTermsForPair("en", "fr");
    expect(pack.glossaryLines.length).toBeGreaterThan(400);
    expect(pack.translationTerms.some((t) => t.source === "CPR" && t.target === "RCP")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "RCP" && t.target === "CPR")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "MRI" && t.target === "IRM")).toBe(true);
    expect(
      pack.translationTerms.some((t) => t.source === "Immigration status" && /statut migratoire/i.test(t.target)),
    ).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "Car insurance" && /assurance/i.test(t.target))).toBe(true);
  });

  it("keeps en-pt Soniox context inside the non-JA budget", () => {
    const dialect = buildStableDialectContext("en", "pt");
    const pack = packTermsForPair("en", "pt");
    const ctx = mergeSonioxXInterpreterContext({
      dialect,
      packTerms: pack.translationTerms,
      packPins: pack.recognitionPins,
      packLines: pack.glossaryLines,
      userTerms: [],
      langA: "en",
      langB: "pt",
    });
    const n = JSON.stringify(ctx).length;
    expect(n).toBeGreaterThan(7_500);
    expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    for (const en of ["CPR", "MRI", "Immigration status", "Car insurance"] as const) {
      const ok =
        ctx.translation_terms?.some((t) => t.source === en) || (ctx.text ?? "").includes(`${en}=`);
      expect(ok, `${en} missing; chars=${n}`).toBe(true);
    }
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
    expect(n).toBeGreaterThan(7_500);
    expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    for (const en of ["CPR", "MRI", "Sonogram"] as const) {
      const ok =
        ctx.translation_terms?.some((t) => t.source === en) || (ctx.text ?? "").includes(`${en}=`);
      expect(ok, `${en} missing; chars=${n}`).toBe(true);
    }
    const sono = ctx.translation_terms?.find((t) => t.source === "Sonogram");
    expect(sono?.target).toBe("ecografía");
    expect(sono?.target ?? "").not.toMatch(/sonogram/i);
    expect(ctx.text).toMatch(/español estándar/i);
    expect(ctx.terms?.some((t) => /you're through to the Spanish interpreter/i.test(t))).toBe(true);
    expect(ctx.terms?.some((t) => /Arabic interpreter/i.test(t))).toBe(true);
  });

  it("loads the en-de medical pack both directions", () => {
    const pack = packTermsForPair("en", "de");
    expect(pack.translationTerms.some((t) => t.source === "CPR" && /Herz-Lungen-Wiederbelebung|Wiederbelebung/.test(t.target))).toBe(
      true,
    );
    expect(pack.translationTerms.some((t) => t.source === "Sonogram")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "MRI")).toBe(true);
    expect(pack.glossaryLines.length).toBeGreaterThan(400);
  });

  it("pins high-value German medical terms inside the Soniox budget", () => {
    const dialect = buildStableDialectContext("en", "de");
    const pack = packTermsForPair("en", "de");
    const ctx = mergeSonioxXInterpreterContext({
      dialect,
      packTerms: pack.translationTerms,
      packPins: pack.recognitionPins,
      packLines: pack.glossaryLines,
      userTerms: [],
      langA: "en",
      langB: "de",
    });
    const n = JSON.stringify(ctx).length;
    expect(n).toBeGreaterThan(7_500);
    expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    for (const en of ["CPR", "MRI", "Sonogram"] as const) {
      const ok =
        ctx.translation_terms?.some((t) => t.source === en) || (ctx.text ?? "").includes(`${en}=`);
      expect(ok, `${en} missing; chars=${n}`).toBe(true);
    }
    expect(ctx.text).toMatch(/Hochdeutsch/i);
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
    expect(n).toBeGreaterThan(7_500);
    expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
    for (const en of ["CPR", "MRI", "Sonogram"] as const) {
      const ok =
        ctx.translation_terms?.some((t) => t.source === en) || (ctx.text ?? "").includes(`${en}=`);
      expect(ok, `${en} missing; chars=${n}`).toBe(true);
    }
    const sono = ctx.translation_terms?.find((t) => t.source === "Sonogram");
    expect(sono?.target).toBe("ultrasonografia");
    expect(sono?.target ?? "").not.toMatch(/sonogram/i);
    expect(ctx.text).toMatch(/ogólnopolski|polszczyzna/i);
  });

  it("loads the en-ja medical, legal, and auto pack both directions", () => {
    const pack = packTermsForPair("en", "ja");
    expect(pack.translationTerms.some((t) => t.source === "CPR" && t.target === "心肺蘇生")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "心肺蘇生" && t.target === "CPR")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "Sonogram" && t.target === "超音波画像")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "MRI" && t.target === "磁気共鳴画像")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "Immigration status" && t.target === "在留資格")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "Felony" && t.target === "重罪")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "Pro bono")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "Car insurance" && t.target === "自動車保険")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "Car accident" && t.target === "自動車事故")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "Insurance claim" && t.target === "保険金請求")).toBe(true);
    expect(pack.glossaryLines.length).toBeGreaterThan(400);
  });

  it("keeps the Japanese Soniox context lean so JA speech is not silenced", () => {
    const dialect = buildStableDialectContext("en", "ja");
    const pack = packTermsForPair("en", "ja");
    const ctx = mergeSonioxXInterpreterContext({
      dialect,
      packTerms: pack.translationTerms,
      packPins: pack.recognitionPins,
      packLines: pack.glossaryLines,
      userTerms: [],
      langA: "en",
      langB: "ja",
    });
    const n = JSON.stringify(ctx).length;
    expect(n).toBeLessThanOrEqual(SONIOX_X_JA_CONTEXT_SAFE_CHARS);
    expect(n).toBeLessThan(6_500);
    // Far under the old ~9k dump that silenced Japanese speech.
    expect(n).toBeLessThan(7_500);
    // No bulk English=Japanese text dump (that locks LID onto English).
    expect(ctx.text ?? "").not.toMatch(/Bidirectional medical glossary/);
    for (const en of ["CPR", "MRI", "Sonogram", "Immigration status", "Car insurance"] as const) {
      const ok =
        ctx.translation_terms?.some((t) => t.source === en) || (ctx.text ?? "").includes(`${en}=`);
      expect(ok, `${en} missing; chars=${n}`).toBe(true);
    }
    const sono = ctx.translation_terms?.find((t) => t.source === "Sonogram");
    expect(sono?.target).toBe("超音波画像");
    expect(JSON.stringify(ctx.general)).toMatch(/hyōjungo|標準語/);
    expect(JSON.stringify(ctx.general)).toMatch(/Never treat Japanese as silence|never treat Japanese as silence|Never leave the original blank for Japanese/i);
    expect(ctx.terms?.some((t) => /you're through to the Japanese interpreter/i.test(t))).toBe(true);
  });

  it("pins high-value legal terms for Arabic/Spanish/Portuguese/Polish/German/Italian/Japanese/French", () => {
    for (const [a, b] of [
      ["en", "ar"],
      ["en", "es"],
      ["en", "pt"],
      ["en", "pl"],
      ["en", "de"],
      ["en", "it"],
      ["en", "ja"],
      ["en", "fr"],
    ] as const) {
      const pack = packTermsForPair(a, b);
      expect(pack.translationTerms.some((t) => t.source === "Immigration status")).toBe(true);
      expect(pack.translationTerms.some((t) => t.source === "Felony")).toBe(true);
      expect(pack.translationTerms.some((t) => t.source === "Pro bono")).toBe(true);
      const dialect = buildStableDialectContext(a, b);
      const ctx = mergeSonioxXInterpreterContext({
        dialect,
        packTerms: pack.translationTerms,
        packPins: pack.recognitionPins,
        packLines: pack.glossaryLines,
        userTerms: [],
        langA: a,
        langB: b,
      });
      const n = JSON.stringify(ctx).length;
      expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
      expect(n).toBeLessThan(10_000);
      expect(
        ctx.translation_terms?.some((t) => t.source === "Immigration status") ||
          (ctx.text ?? "").includes("Immigration status="),
      ).toBe(true);
      expect(
        ctx.translation_terms?.some((t) => t.source === "Felony") ||
          (ctx.text ?? "").includes("Felony="),
      ).toBe(true);
      expect(
        ctx.translation_terms?.some((t) => t.source === "Pro bono") ||
          (ctx.text ?? "").includes("Pro bono="),
      ).toBe(true);
      if (b === "ar") {
        expect(
          ctx.translation_terms?.some(
            (t) => t.source === "Immigration status" && t.target === "الوضع الهجري",
          ),
        ).toBe(true);
        expect(ctx.translation_terms?.some((t) => t.source === "Felony" && t.target === "جناية")).toBe(true);
      }
    }
  });

  it("pins high-value auto insurance terms for Arabic/Spanish/Portuguese/Polish/German/Italian/Japanese/French", () => {
    for (const [a, b] of [
      ["en", "ar"],
      ["en", "es"],
      ["en", "pt"],
      ["en", "pl"],
      ["en", "de"],
      ["en", "it"],
      ["en", "ja"],
      ["en", "fr"],
    ] as const) {
      const pack = packTermsForPair(a, b);
      expect(pack.translationTerms.some((t) => t.source === "Car insurance")).toBe(true);
      expect(pack.translationTerms.some((t) => t.source === "Car accident")).toBe(true);
      expect(pack.translationTerms.some((t) => t.source === "Insurance claim")).toBe(true);
      const dialect = buildStableDialectContext(a, b);
      const ctx = mergeSonioxXInterpreterContext({
        dialect,
        packTerms: pack.translationTerms,
        packPins: pack.recognitionPins,
        packLines: pack.glossaryLines,
        userTerms: [],
        langA: a,
        langB: b,
      });
      const n = JSON.stringify(ctx).length;
      expect(n).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
      expect(n).toBeLessThan(10_000);
      expect(
        ctx.translation_terms?.some((t) => t.source === "Car insurance") ||
          (ctx.text ?? "").includes("Car insurance="),
      ).toBe(true);
      expect(
        ctx.translation_terms?.some((t) => t.source === "Car accident") ||
          (ctx.text ?? "").includes("Car accident="),
      ).toBe(true);
      expect(
        ctx.translation_terms?.some((t) => t.source === "Insurance claim") ||
          (ctx.text ?? "").includes("Insurance claim="),
      ).toBe(true);
      if (b === "ar") {
        expect(
          ctx.translation_terms?.some(
            (t) => t.source === "Car insurance" && t.target === "تأمين السيارة",
          ),
        ).toBe(true);
        expect(
          ctx.translation_terms?.some((t) => t.source === "Car accident" && t.target === "حادث سيارة"),
        ).toBe(true);
      }
    }
  });
});
