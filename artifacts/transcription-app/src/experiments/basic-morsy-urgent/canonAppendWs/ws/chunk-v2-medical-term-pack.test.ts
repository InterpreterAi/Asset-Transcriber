import { describe, expect, it } from "vitest";

import { buildChunkV2MedicalPackContext, chunkV2MedicalPackStats } from "./chunk-v2-medical-term-pack";

describe("chunk-v2 medical term pack", () => {
  it("includes vaccines and ISA terms in pack stats", () => {
    const s = chunkV2MedicalPackStats();
    expect(s.vaccines).toBeGreaterThanOrEqual(80);
    expect(s.isaTerms).toBeGreaterThanOrEqual(600);
    expect(s.languages).toBe(61); // workspace langs excluding en
  });

  it("builds en↔ar translation terms for MMR and vaccines", () => {
    const ctx = buildChunkV2MedicalPackContext("en", "ar");
    expect(ctx.terms.some((t) => /MMR/i.test(t))).toBe(true);
    expect(ctx.terms.some((t) => /COVID-19/i.test(t))).toBe(true);
    const mmr = ctx.translation_terms.find(
      (t) => t.source === "MMR" || /الحصبة/.test(t.target) || /الحصبة/.test(t.source),
    );
    expect(mmr).toBeTruthy();
    // bidirectional coverage
    expect(
      ctx.translation_terms.some((t) => t.source === "MMR" && /لقاح|حصبة/.test(t.target)),
    ).toBe(true);
  });

  it("builds es↔en pairs without shipping unrelated language targets", () => {
    const ctx = buildChunkV2MedicalPackContext("es", "en");
    expect(ctx.translation_terms.some((t) => /vacuna/i.test(t.source) || /vacuna/i.test(t.target))).toBe(
      true,
    );
    // Should not inject Arabic when pair is es-en
    expect(ctx.translation_terms.some((t) => /[\u0600-\u06FF]/.test(t.source + t.target))).toBe(false);
  });

  it("includes corrected ISA immunisation aliases as EN pins", () => {
    const ctx = buildChunkV2MedicalPackContext("en", "fr");
    expect(ctx.terms.some((t) => /Hib|Haemophilus/i.test(t))).toBe(true);
    expect(ctx.terms.some((t) => /DTaP|DTP/i.test(t))).toBe(true);
    expect(ctx.terms.some((t) => /BCG/i.test(t))).toBe(true);
  });

  it("respects translation_terms budget", () => {
    const ctx = buildChunkV2MedicalPackContext("en", "ar");
    expect(ctx.translation_terms.length).toBeLessThanOrEqual(72);
    expect(ctx.terms.length).toBeLessThanOrEqual(96);
  });
});
