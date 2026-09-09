import { describe, expect, it } from "vitest";

import { sonioxRealtimeLanguageHintConfig } from "./soniox-stt-language-hints";

describe("sonioxRealtimeLanguageHintConfig", () => {
  it("does not strict-lock bilingual pair hints (en+ar)", () => {
    expect(sonioxRealtimeLanguageHintConfig(["en", "ar"])).toEqual({
      language_hints: ["en", "ar"],
    });
    expect(sonioxRealtimeLanguageHintConfig(["en", "ar"]).language_hints_strict).toBeUndefined();
  });

  it("allows strict only for a single hint (proxy pairs)", () => {
    expect(sonioxRealtimeLanguageHintConfig(["sw"])).toEqual({
      language_hints: ["sw"],
      language_hints_strict: true,
    });
  });
});
