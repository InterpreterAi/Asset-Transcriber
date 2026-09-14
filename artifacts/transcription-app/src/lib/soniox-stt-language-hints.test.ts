import { describe, expect, it } from "vitest";

import { stableSonioxBilingualOrder } from "./soniox-stt-language-hints";

describe("stableSonioxBilingualOrder", () => {
  it("configures en↔ar and ar↔en identically", () => {
    expect(stableSonioxBilingualOrder({ a: "en", b: "ar" })).toEqual({ a: "en", b: "ar" });
    expect(stableSonioxBilingualOrder({ a: "ar", b: "en" })).toEqual({ a: "en", b: "ar" });
  });
});
