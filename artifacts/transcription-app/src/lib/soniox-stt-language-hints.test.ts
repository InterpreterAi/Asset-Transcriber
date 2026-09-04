import { describe, expect, it } from "vitest";

import {
  buildSonioxLanguageHints,
  lockPairLanguageFromWrittenText,
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

describe("lockPairLanguageFromWrittenText", () => {
  const pair = { a: "en", b: "ar" };

  it("tags Arabic script as Arabic even when LID said English", () => {
    expect(lockPairLanguageFromWrittenText("واش راك لاباس", "en", pair)).toBe("ar");
  });

  it("tags Latin as English even when LID said Arabic", () => {
    expect(lockPairLanguageFromWrittenText("I never had a steak", "ar", pair)).toBe("en");
  });

  it("does not rewrite Latin↔Latin pairs from script", () => {
    expect(lockPairLanguageFromWrittenText("Buenos dias amigo", "es", { a: "en", b: "es" })).toBe(
      "es",
    );
  });

  it("keeps the LID tag when the text is too short", () => {
    expect(lockPairLanguageFromWrittenText("hi", "en", pair)).toBe("en");
  });
});
