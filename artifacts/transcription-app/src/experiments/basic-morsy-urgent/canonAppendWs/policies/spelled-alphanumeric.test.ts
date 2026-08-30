import { describe, expect, it } from "vitest";

import {
  looksLikeBackchannel,
  looksLikeSpelledAlphanumeric,
  repairSpokenEmailTranslation,
  shouldHoldSpelledAlphanumericRow,
} from "./spelled-alphanumeric";

describe("looksLikeSpelledAlphanumeric", () => {
  it("accepts spelled email scraps", () => {
    expect(looksLikeSpelledAlphanumeric("G-L dot.")).toBe(true);
    expect(looksLikeSpelledAlphanumeric("S.")).toBe(true);
    expect(looksLikeSpelledAlphanumeric("C-C K.")).toBe(true);
    expect(looksLikeSpelledAlphanumeric("Dot com.")).toBe(true);
    expect(looksLikeSpelledAlphanumeric("S is?")).toBe(true);
    expect(looksLikeSpelledAlphanumeric("P. House?")).toBe(true);
  });

  it("rejects backchannels and full sentences", () => {
    expect(looksLikeBackchannel("Uh-huh")).toBe(true);
    expect(looksLikeSpelledAlphanumeric("Uh-huh")).toBe(false);
    expect(looksLikeSpelledAlphanumeric("All right. That's 1-888-642-7434.")).toBe(false);
  });
});

describe("shouldHoldSpelledAlphanumericRow", () => {
  it("holds same-speaker letter scraps and not uh-huh", () => {
    expect(shouldHoldSpelledAlphanumericRow("S.", "C.")).toBe(true);
    expect(shouldHoldSpelledAlphanumericRow("House.", "Dot com.")).toBe(true);
    expect(shouldHoldSpelledAlphanumericRow("S.", "Uh-huh")).toBe(false);
  });
});

describe("repairSpokenEmailTranslation", () => {
  it("maps نقطة / dot on spelled rows only", () => {
    expect(repairSpokenEmailTranslation("Dot com.", "نقطة كوم.")).toBe(".com");
    expect(repairSpokenEmailTranslation("G-L dot.", "G-L نقطة.")).toBe("G-L.");
    expect(repairSpokenEmailTranslation("S is?", "S يعني؟")).toBe("S؟");
    expect(
      repairSpokenEmailTranslation(
        "All right. That's 1-888-642-7434.",
        "حسناً. هذا هو 1-888-642-7434.",
      ),
    ).toBe("حسناً. هذا هو 1-888-642-7434.");
  });
});
