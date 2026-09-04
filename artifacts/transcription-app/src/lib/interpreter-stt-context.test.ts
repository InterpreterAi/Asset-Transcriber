import { describe, expect, it } from "vitest";

import {
  buildSonioxInterpreterContext,
  sonioxContextForRealtimePayload,
} from "./interpreter-stt-context";

describe("buildSonioxInterpreterContext", () => {
  it("keeps en↔ar and ar↔en recognition instructions identical", () => {
    const forward = buildSonioxInterpreterContext({ a: "en", b: "ar" });
    const reverse = buildSonioxInterpreterContext({ a: "ar", b: "en" });
    expect(forward.general).toEqual(reverse.general);
    expect(forward.terms).toEqual(reverse.terms);
    expect(forward.general.find((g) => g.key === "language")?.value).toBe("English and Arabic");
    expect(forward.general.some((g) => g.key === "arabic_script")).toBe(true);
    expect(forward.general.some((g) => g.key === "instructions")).toBe(true);
  });

  it("does not flood English medical vocabulary into STT terms", () => {
    const ctx = buildSonioxInterpreterContext({ a: "en", b: "ar" });
    const blob = ctx.terms.join(" ").toLowerCase();
    expect(blob).not.toMatch(/colonoscopy|hypertension|myocardial|subpoena|medicaid/);
    expect(ctx.terms.some((t) => /مرحبا|شكرا/.test(t))).toBe(true);
  });

  it("omits free-form English boilerplate text that biased early tokens", () => {
    const ctx = buildSonioxInterpreterContext({ a: "en", b: "ar" });
    expect(ctx.text).toBe("");
    const payload = sonioxContextForRealtimePayload(ctx);
    expect(payload.text).toBeUndefined();
    expect(payload.general.some((g) => g.key === "instructions")).toBe(true);
  });

  it("includes Arabic script terms for Arabic pairs only", () => {
    const ar = buildSonioxInterpreterContext({ a: "en", b: "ar" });
    const es = buildSonioxInterpreterContext({ a: "en", b: "es" });
    expect(ar.terms.some((t) => /[\u0600-\u06FF]/.test(t))).toBe(true);
    expect(es.terms.some((t) => /[\u0600-\u06FF]/.test(t))).toBe(false);
    expect(es.general.some((g) => g.key === "arabic_script")).toBe(false);
  });
});
