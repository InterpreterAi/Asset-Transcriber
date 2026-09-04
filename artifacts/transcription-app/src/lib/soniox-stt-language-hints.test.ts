import { describe, expect, it } from "vitest";

import {
  buildSonioxLanguageHints,
  sonioxRealtimeLanguageHintConfig,
  stableSonioxBilingualOrder,
} from "./soniox-stt-language-hints";

describe("stableSonioxBilingualOrder", () => {
  it("configures en↔ar and ar↔en identically", () => {
    expect(stableSonioxBilingualOrder({ a: "en", b: "ar" })).toEqual({ a: "en", b: "ar" });
    expect(stableSonioxBilingualOrder({ a: "ar", b: "en" })).toEqual({ a: "en", b: "ar" });
  });
});

describe("sonioxRealtimeLanguageHintConfig", () => {
  it("does not restrict bilingual interpreter pairs (Soniox: two-language strict can pick the wrong script)", () => {
    const hints = buildSonioxLanguageHints({ a: "en", b: "ar" });
    expect(hints).toEqual(["en", "ar"]);
    expect(sonioxRealtimeLanguageHintConfig(hints)).toEqual({ language_hints: ["en", "ar"] });
  });

  it("restricts only a single proxy hint", () => {
    const hints = buildSonioxLanguageHints({ a: "en", b: "so" });
    expect(hints).toEqual(["sw"]);
    expect(sonioxRealtimeLanguageHintConfig(hints)).toEqual({
      language_hints: ["sw"],
      language_hints_strict: true,
    });
  });
});
