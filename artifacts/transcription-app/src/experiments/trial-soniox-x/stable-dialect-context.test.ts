import { describe, expect, it } from "vitest";
import { languages } from "./languages";
import {
  STABLE_WRITTEN_DIALECT,
  buildStableDialectContext,
  dialectPinsCoverOfficialLanguages,
} from "./stable-dialect-context";

describe("stable dialect pins", () => {
  it("covers every official Soniox live-demo language", () => {
    expect(dialectPinsCoverOfficialLanguages()).toBe(true);
    expect(Object.keys(STABLE_WRITTEN_DIALECT).sort()).toEqual(
      languages.map((lang) => lang.code).sort(),
    );
  });

  it("pins Arabic to فصحى and the main European standards", () => {
    expect(STABLE_WRITTEN_DIALECT.ar).toMatch(/فصحى/);
    expect(STABLE_WRITTEN_DIALECT.ar).toMatch(/Modern Standard Arabic/);
    expect(STABLE_WRITTEN_DIALECT.ar).toMatch(/TRANSLATION column only/i);
    expect(STABLE_WRITTEN_DIALECT.ar).not.toMatch(/Egyptian/);
    expect(STABLE_WRITTEN_DIALECT.es).toMatch(/español estándar/i);
    expect(STABLE_WRITTEN_DIALECT.fr).toMatch(/français de France/i);
    expect(STABLE_WRITTEN_DIALECT.de).toMatch(/Hochdeutsch/);
    expect(STABLE_WRITTEN_DIALECT.pl).toMatch(/ogólnopolski|polszczyzna/i);
  });

  it("puts the selected pair in general context and does not dump all 60 languages", () => {
    const ctx = buildStableDialectContext("ar", "en");
    const blob = JSON.stringify(ctx);
    expect(blob.length).toBeLessThan(10_000);
    expect(ctx.general?.length ?? 0).toBeLessThanOrEqual(10);
    expect(ctx.general?.some((row) => /فصحى/.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /Both languages will be spoken/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /Never drop one side/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /Yemeni/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /Iraqi/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /Algerian/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /Tunisian/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /not French/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /TRANSLATION column only/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => row.key === "accuracy" && /No added stories/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => row.key === "translation" && /Never invent/i.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => row.key === "translation" && /use only the target wording from translation_terms/i.test(row.value))).toBe(false);
    expect(ctx.general?.some((row) => row.key === "numbers")).toBe(false);
    expect(blob).not.toMatch(/digit sequence/i);
    expect(blob).not.toMatch(/never as spelled-out number words/i);
    expect(ctx.terms?.includes("بزاف")).toBe(true);
    expect(ctx.text).toMatch(/الفصحى/);
    expect(ctx.text).toMatch(/Yemeni/);
    expect(ctx.general?.some((row) => row.key === "translation" && /standard international English|الفصحى/.test(row.value))).toBe(true);
    expect(ctx.text).not.toMatch(/Forbidden in Arabic translations/);
    expect(ctx.text).not.toContain("يا عم");
    expect(ctx.text).not.toContain("cy:");
    expect(ctx.translation_terms?.some((t) => t.source === "next time")).toBe(true);
  });

  it("pins Spanish/French/German/Polish when they are in the pair", () => {
    const es = buildStableDialectContext("es", "en");
    expect(es.general?.some((row) => /Never drop one side/i.test(row.value))).toBe(true);
    expect(es.general?.some((row) => /español estándar/i.test(row.value))).toBe(true);
    expect(es.text).toMatch(/español estándar/i);
    expect(es.text).toMatch(/ecografía/i);
    expect(es.translation_terms?.some((t) => t.source === "next time" && t.target === "la próxima vez")).toBe(
      true,
    );

    const fr = buildStableDialectContext("fr", "pl");
    expect(fr.general?.some((row) => /français de France/i.test(row.value))).toBe(true);
    expect(fr.general?.some((row) => /ogólnopolski|polszczyzna/i.test(row.value))).toBe(true);
    expect(fr.text).toMatch(/Hochdeutsch|français|ogólnopolski|polszczyzna|France/i);
  });

  it("pins Polish to język ogólnopolski when it is in the pair", () => {
    const pl = buildStableDialectContext("pl", "en");
    expect(pl.general?.some((row) => /ogólnopolski|polszczyzna/i.test(row.value))).toBe(true);
    expect(pl.text).toMatch(/ultrasonografia/i);
    expect(pl.translation_terms?.some((t) => t.source === "next time" && t.target === "następnym razem")).toBe(
      true,
    );
  });

  it("pins German to Hochdeutsch and standard next-time wording", () => {
    const de = buildStableDialectContext("de", "en");
    expect(de.general?.some((row) => /Hochdeutsch/i.test(row.value))).toBe(true);
    expect(de.text).toMatch(/Sonogramm/i);
    expect(de.translation_terms?.some((t) => t.source === "next time" && t.target === "nächstes Mal")).toBe(
      true,
    );
  });
});
