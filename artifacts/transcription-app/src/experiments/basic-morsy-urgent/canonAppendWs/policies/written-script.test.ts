import { describe, expect, it } from "vitest";

import { rowBreaksForWrittenScript, writtenScriptFamily } from "./written-script";

describe("writtenScriptFamily", () => {
  it("detects Arabic vs Latin", () => {
    expect(writtenScriptFamily("خد من الصيدلية")).toBe("arabic");
    expect(writtenScriptFamily("Okay And has he")).toBe("latin");
  });

  it("returns null for too-short scraps", () => {
    expect(writtenScriptFamily("S.")).toBeNull();
    expect(writtenScriptFamily("—")).toBeNull();
  });
});

describe("rowBreaksForWrittenScript", () => {
  it("splits when Latin row meets Arabic token", () => {
    expect(
      rowBreaksForWrittenScript("Okay. And has he, uh, Mirham, has—", "خد من"),
    ).toBe(true);
  });

  it("does not split Latin↔Latin", () => {
    expect(rowBreaksForWrittenScript("Judge is going to be happy", "about that")).toBe(false);
  });
});
