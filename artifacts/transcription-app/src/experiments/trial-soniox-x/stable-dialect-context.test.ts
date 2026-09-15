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
    expect(STABLE_WRITTEN_DIALECT.es).toMatch(/español estándar/i);
    expect(STABLE_WRITTEN_DIALECT.fr).toMatch(/français standard/i);
    expect(STABLE_WRITTEN_DIALECT.de).toMatch(/Hochdeutsch/);
    expect(STABLE_WRITTEN_DIALECT.pl).toMatch(/ogólnopolski|polszczyzna/i);
  });

  it("puts the selected pair in general context and does not dump all 60 languages", () => {
    const ctx = buildStableDialectContext("ar", "en");
    const blob = JSON.stringify(ctx);
    expect(blob.length).toBeLessThan(10_000);
    expect(ctx.general?.length ?? 0).toBeLessThanOrEqual(10);
    expect(ctx.general?.some((row) => /فصحى/.test(row.value))).toBe(true);
    expect(ctx.general?.some((row) => /Original: transcribe exactly as spoken/i.test(row.value))).toBe(
      true,
    );
    expect(ctx.text).toMatch(/الفصحى/);
    expect(ctx.text).not.toContain("cy:");
    expect(ctx.translation_terms?.some((t) => t.source === "next time")).toBe(true);
  });

  it("pins Spanish/French/German/Polish when they are in the pair", () => {
    const es = buildStableDialectContext("es", "en");
    expect(es.general?.some((row) => /español estándar/i.test(row.value))).toBe(true);
    expect(es.text).toMatch(/español estándar/i);
    expect(es.text).toMatch(/ecografía/i);
    expect(es.translation_terms?.some((t) => t.source === "next time" && t.target === "la próxima vez")).toBe(
      true,
    );

    const fr = buildStableDialectContext("fr", "pl");
    expect(fr.general?.some((row) => /français standard/i.test(row.value))).toBe(true);
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
});
