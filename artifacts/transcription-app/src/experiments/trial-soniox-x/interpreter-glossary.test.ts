import { describe, expect, it } from "vitest";
import { buildStableDialectContext } from "./stable-dialect-context";
import {
  englishPivotPairKey,
  mergeSonioxXInterpreterContext,
  packTermsForPair,
  userGlossaryToTerms,
  SONIOX_X_CONTEXT_SAFE_CHARS,
  SONIOX_X_CONTEXT_TARGET_CHARS,
  type GlossaryTerm,
} from "./interpreter-glossary";

function contextFor(a: string, b: string, userTerms: GlossaryTerm[] = []) {
  const pack = packTermsForPair(a, b);
  return mergeSonioxXInterpreterContext({
    dialect: buildStableDialectContext(a, b),
    packTerms: pack.translationTerms,
    userTerms,
    langA: a,
    langB: b,
  });
}

function hasSource(ctx: ReturnType<typeof contextFor>, en: string): boolean {
  return Boolean(ctx.translation_terms?.some((t) => t.source.toLowerCase() === en.toLowerCase()));
}

const PRIORITY_PAIRS = [
  ["en", "ar"],
  ["en", "es"],
  ["en", "pt"],
  ["en", "pl"],
  ["en", "de"],
  ["en", "it"],
  ["en", "ja"],
  ["en", "fr"],
] as const;

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

  it("loads the en-de medical pack both directions", () => {
    const pack = packTermsForPair("en", "de");
    expect(pack.translationTerms.some((t) => t.source === "CPR" && /Herz-Lungen-Wiederbelebung|Wiederbelebung/.test(t.target))).toBe(
      true,
    );
    expect(pack.translationTerms.some((t) => t.source === "Sonogram")).toBe(true);
    expect(pack.translationTerms.some((t) => t.source === "MRI")).toBe(true);
    expect(pack.glossaryLines.length).toBeGreaterThan(400);
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

  it("keeps every priority pair small and sends no glossary text dump or English pins in terms", () => {
    for (const [a, b] of PRIORITY_PAIRS) {
      const ctx = contextFor(a, b);
      const n = JSON.stringify(ctx).length;
      expect(n, `${b}: ${n}`).toBeLessThanOrEqual(SONIOX_X_CONTEXT_TARGET_CHARS);
      expect(ctx.text, b).toBeUndefined();
      expect(ctx.general?.map((row) => row.key), b).toEqual(["domain", "language", "instructions", "translation"]);
      for (const term of ctx.terms ?? []) {
        expect(/^[A-Z]{2,8}$/.test(term), `${b}: ${term}`).toBe(false);
      }
    }
  });

  it("sends the core medical, legal, and insurance pins for every priority pair", () => {
    for (const [a, b] of PRIORITY_PAIRS) {
      const ctx = contextFor(a, b);
      for (const en of ["Immigration status", "Felony", "Pro bono", "Car insurance", "Car accident", "Insurance claim"]) {
        expect(hasSource(ctx, en), `${b}: ${en}`).toBe(true);
      }
      // The Italian pack is legal + insurance only (no medical rows).
      if (b === "it") continue;
      for (const en of ["CPR", "MRI"]) {
        expect(hasSource(ctx, en), `${b}: ${en}`).toBe(true);
      }
    }
    for (const b of ["ar", "es", "pl", "de", "ja"]) {
      expect(hasSource(contextFor("en", b), "Sonogram"), `${b}: Sonogram`).toBe(true);
    }
  });

  it("uses the exact Arabic and target wording for key pins, never the English word", () => {
    const ar = contextFor("en", "ar");
    const find = (en: string) => ar.translation_terms?.find((t) => t.source.toLowerCase() === en.toLowerCase());
    expect(find("sonogram")?.target).toBe("تصوير بالموجات فوق الصوتية");
    expect(find("Immigration status")?.target).toBe("الوضع الهجري");
    expect(find("Felony")?.target).toBe("جناية");
    expect(find("Car insurance")?.target).toBe("تأمين السيارة");
    expect(find("Car accident")?.target).toBe("حادث سيارة");
    expect(contextFor("en", "es").translation_terms?.find((t) => /^sonogram$/i.test(t.source))?.target).toBe("ecografía");
    expect(contextFor("en", "pl").translation_terms?.find((t) => /^sonogram$/i.test(t.source))?.target).toBe(
      "ultrasonografia",
    );
    expect(contextFor("en", "ja").translation_terms?.find((t) => /^sonogram$/i.test(t.source))?.target).toBe("超音波画像");
  });

  it("never sends two targets for the same source", () => {
    for (const [a, b] of PRIORITY_PAIRS) {
      const sources = (contextFor(a, b).translation_terms ?? []).map((t) => t.source.toLowerCase());
      expect(new Set(sources).size, b).toBe(sources.length);
    }
  });

  it("puts the personal glossary first and lets it win over the shared pack", () => {
    const user = userGlossaryToTerms(
      [
        { term: "MRI", translation: "الرنين المغناطيسي", sourceLanguage: "en", targetLanguage: "ar" },
        { term: "Photo ID", translation: "بطاقة هوية تحمل صورة شخصية" },
      ],
      "en",
      "ar",
    );
    const ctx = contextFor("en", "ar", user);
    expect(ctx.translation_terms?.slice(0, 4)).toEqual(user);
    expect(ctx.translation_terms?.filter((t) => t.source === "MRI")).toEqual([
      { source: "MRI", target: "الرنين المغناطيسي" },
    ]);
  });

  it("never trims a large personal glossary for budget, only at the Soniox hard limit", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      term: `custom term ${i}`,
      translation: `مصطلح خاص ${i}`,
      sourceLanguage: "en",
      targetLanguage: "ar",
    }));
    const user = userGlossaryToTerms(rows, "en", "ar");
    const ctx = contextFor("en", "ar", user);
    for (const t of user) expect(ctx.translation_terms).toContainEqual(t);
    expect(JSON.stringify(ctx).length).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);

    const huge = userGlossaryToTerms(
      Array.from({ length: 400 }, (_, i) => ({ term: `very long custom term number ${i}`, translation: `مصطلح خاص طويل رقم ${i}` })),
      "en",
      "ar",
    );
    expect(JSON.stringify(contextFor("en", "ar", huge)).length).toBeLessThanOrEqual(SONIOX_X_CONTEXT_SAFE_CHARS);
  });

  it("pairs without a shared pack send only the short pair context", () => {
    const ctx = contextFor("fr", "de");
    expect(ctx.translation_terms).toBeUndefined();
    expect(JSON.stringify(ctx).length).toBeLessThan(1_000);
  });
});
