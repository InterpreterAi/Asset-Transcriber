import { describe, expect, it } from "vitest";

import { buildIsolatedRuntimeSonioxContext } from "./isolated-session-context";
import { sonioxContextCharLength, SONIOX_CONTEXT_SAFE_CHARS } from "./soniox-context-budget";

describe("buildIsolatedRuntimeSonioxContext", () => {
  it("always sends spoken-as-is pair recognition for Libre/OpenAI STT", () => {
    const ctx = buildIsolatedRuntimeSonioxContext({ a: "ar", b: "en" }, {
      chunkV2NativeTranslate: false,
    });
    expect(ctx.general.some((g) => g.key === "pair_language")).toBe(true);
    expect(ctx.general.some((g) => g.key === "spoken_as_is")).toBe(true);
    expect(ctx.text).toMatch(/interpreter/i);
  });

  it("keeps en↔ar and ar↔en STT context equivalent", () => {
    const enAr = buildIsolatedRuntimeSonioxContext({ a: "en", b: "ar" }, {
      chunkV2NativeTranslate: false,
    });
    const arEn = buildIsolatedRuntimeSonioxContext({ a: "ar", b: "en" }, {
      chunkV2NativeTranslate: false,
    });
    const pairA = enAr.general.find((g) => g.key === "pair_language")?.value;
    const pairB = arEn.general.find((g) => g.key === "pair_language")?.value;
    expect(pairA).toMatch(/English/);
    expect(pairA).toMatch(/Arabic/);
    expect(pairB).toMatch(/English/);
    expect(pairB).toMatch(/Arabic/);
    expect(pairA).toMatch(/Both directions/);
    expect(pairB).toMatch(/Both directions/);
  });

  it("keeps chunk-v2 native context under the Soniox budget", () => {
    const ctx = buildIsolatedRuntimeSonioxContext({ a: "en", b: "ar" }, {
      chunkV2NativeTranslate: true,
    });
    expect(sonioxContextCharLength(ctx)).toBeLessThanOrEqual(SONIOX_CONTEXT_SAFE_CHARS);
    expect(ctx.general.some((g) => g.key === "pair_language")).toBe(true);
  });
});
