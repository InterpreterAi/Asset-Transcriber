import { describe, expect, it } from "vitest";
import { languages } from "./languages";
import {
  STABLE_WRITTEN_DIALECT,
  buildStableDialectContext,
  dialectPinsCoverOfficialLanguages,
} from "./stable-dialect-context";

const DIALECT_NAMES = /Yemeni|Iraqi|Gulf|Hijazi|Najdi|Levantine|Egyptian|Sudanese|Darija|Algerian|Tunisian|Libyan|Hassaniya|Maghrebi/i;

describe("stable written standard per language", () => {
  it("covers every official Soniox live-demo language", () => {
    expect(dialectPinsCoverOfficialLanguages()).toBe(true);
    expect(Object.keys(STABLE_WRITTEN_DIALECT).sort()).toEqual(
      languages.map((lang) => lang.code).sort(),
    );
  });

  it("pins Arabic to فصحى and the main European standards", () => {
    expect(STABLE_WRITTEN_DIALECT.ar).toMatch(/فصحى/);
    expect(STABLE_WRITTEN_DIALECT.ar).toMatch(/Modern Standard Arabic/);
    expect(STABLE_WRITTEN_DIALECT.ar).toMatch(/never dialect/i);
    expect(STABLE_WRITTEN_DIALECT.ar).not.toMatch(DIALECT_NAMES);
    expect(STABLE_WRITTEN_DIALECT.es).toMatch(/español estándar/i);
    expect(STABLE_WRITTEN_DIALECT.fr).toMatch(/français de France/i);
    expect(STABLE_WRITTEN_DIALECT.de).toMatch(/Hochdeutsch/);
    expect(STABLE_WRITTEN_DIALECT.pl).toMatch(/ogólnopolski/i);
    expect(STABLE_WRITTEN_DIALECT.pt).toMatch(/norma culta/i);
  });
});

describe("pair context (Soniox guidance: short general, language + instructions, terms in the spoken language)", () => {
  it("English↔Arabic: four short lines, فصحى translation, no dialect lists, Arabic call words", () => {
    const ctx = buildStableDialectContext("en", "ar");
    const blob = JSON.stringify(ctx);
    expect(ctx.general?.map((row) => row.key)).toEqual(["domain", "language", "instructions", "translation"]);
    expect(JSON.stringify(ctx.general).length).toBeLessThan(900);
    expect(ctx.general?.find((row) => row.key === "language")?.value).toBe("English and Arabic");
    const instructions = ctx.general?.find((row) => row.key === "instructions")?.value ?? "";
    expect(instructions).toMatch(/Arabic speech in Arabic \(Arabic script\)/);
    expect(instructions).toMatch(/English speech in English/);
    expect(instructions).toMatch(/بالحروف العربية/);
    const translation = ctx.general?.find((row) => row.key === "translation")?.value ?? "";
    expect(translation).toMatch(/Into Arabic: Modern Standard Arabic \(الفصحى\) only, never dialect/);
    expect(translation).toMatch(/Into English: standard professional English/);
    expect(translation).toMatch(/Do not copy English words or abbreviations into the Arabic translation/);
    expect(blob).not.toMatch(DIALECT_NAMES);
    expect(ctx.text).toBeUndefined();
    expect(ctx.terms).toEqual([
      "you're through to the English interpreter",
      "you're through to the Arabic interpreter",
      "نعم",
      "لا",
      "طيب",
      "تمام",
      "يعني",
      "الحمد لله",
      "إن شاء الله",
      "دكتور",
      "موعد",
      "مستشفى",
      "تأمين",
      "محامي",
    ]);
    expect(ctx.translation_terms?.some((t) => t.source === "next time" && t.target === "المرة القادمة")).toBe(true);
    expect(blob).not.toMatch(/family bucket/i);
    expect(blob).not.toMatch(/What the fuck/i);
  });

  it("the same pair gives the same context in either order of languages", () => {
    const ab = buildStableDialectContext("en", "ar");
    const ba = buildStableDialectContext("ar", "en");
    expect(ba.general?.map((row) => row.key)).toEqual(ab.general?.map((row) => row.key));
    expect(new Set(ba.terms)).toEqual(new Set(ab.terms));
    expect(ba.translation_terms).toEqual(ab.translation_terms);
  });

  it("every language pair stays short, has no long rule text, and no Latin abbreviations in terms", () => {
    const codes = languages.map((lang) => lang.code);
    for (const other of codes) {
      if (other === "en") continue;
      const ctx = buildStableDialectContext("en", other);
      const blob = JSON.stringify(ctx);
      expect(blob.length, other).toBeLessThan(1_500);
      expect(ctx.general?.length, other).toBe(4);
      expect(ctx.text, other).toBeUndefined();
      expect(blob, other).not.toMatch(DIALECT_NAMES);
      expect(blob, other).not.toMatch(/UR3|thank you for calling|call_opening/i);
      for (const term of ctx.terms ?? []) {
        expect(/^[A-Z]{2,8}$/.test(term), `${other}: ${term}`).toBe(false);
      }
      expect(ctx.terms?.filter((t) => /interpreter/.test(t)).length, other).toBe(2);
      expect(ctx.terms?.some((t) => /Spanish interpreter/.test(t)), other).toBe(other === "es");
    }
  });

  it("names each language's professional standard in the translation line", () => {
    const line = (a: string, b: string) =>
      buildStableDialectContext(a, b).general?.find((row) => row.key === "translation")?.value ?? "";
    expect(line("en", "es")).toMatch(/Into Spanish: neutral standard Spanish \(español estándar\)/);
    expect(line("en", "de")).toMatch(/Hochdeutsch/);
    expect(line("en", "fr")).toMatch(/français de France/);
    expect(line("en", "pl")).toMatch(/język ogólnopolski/);
    expect(line("en", "pt")).toMatch(/norma culta/);
    expect(line("en", "ja")).toMatch(/標準語 \/ hyōjungo/);
    expect(line("en", "ja")).toMatch(/Professional interpreter translation/);
  });

  it("writes non-Latin languages in their own script", () => {
    const instr = (b: string) =>
      buildStableDialectContext("en", b).general?.find((row) => row.key === "instructions")?.value ?? "";
    expect(instr("ja")).toMatch(/Japanese speech in Japanese \(Japanese script\)/);
    expect(instr("ru")).toMatch(/Russian speech in Russian \(Cyrillic\)/);
    expect(instr("es")).toMatch(/Spanish speech in Spanish,|Spanish speech in Spanish\./);
  });

  it("adds everyday call words for the main non-English languages", () => {
    expect(buildStableDialectContext("en", "es").terms).toContain("gracias");
    expect(buildStableDialectContext("en", "pt").terms).toContain("obrigado");
    expect(buildStableDialectContext("en", "fr").terms).toContain("merci");
    expect(buildStableDialectContext("en", "pl").terms).toContain("dziękuję");
    expect(buildStableDialectContext("en", "de").terms).toContain("danke");
    expect(buildStableDialectContext("en", "it").terms).toContain("grazie");
  });

  it("keeps the standard-phrase translation pins for Spanish, Polish, German, Japanese", () => {
    const has = (b: string, target: string) =>
      buildStableDialectContext("en", b).translation_terms?.some((t) => t.source === "next time" && t.target === target);
    expect(has("es", "la próxima vez")).toBe(true);
    expect(has("pl", "następnym razem")).toBe(true);
    expect(has("de", "nächstes Mal")).toBe(true);
    expect(has("ja", "次回")).toBe(true);
  });
});
