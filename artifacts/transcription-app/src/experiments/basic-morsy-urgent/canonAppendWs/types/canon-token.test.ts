import { describe, expect, it } from "vitest";
import { joinCanonText, joinCanonTextParts, type CanonToken } from "./canon-token";

function tok(text: string): CanonToken {
  return { token_id: text, text, is_final: true };
}

describe("joinCanonTextParts", () => {
  it("collapses double space when committed ends with space and live starts with space", () => {
    expect(joinCanonTextParts(["Good morning ", " ."])).toBe("Good morning .");
  });

  it("does not insert a separator — matches committedText + liveText projection", () => {
    // Medical-call shape: finals carry trailing space; non-finals do not lead with space.
    expect(joinCanonTextParts(["Good morning, this is Dr. Michael Thompson ", "."])).toBe(
      "Good morning, this is Dr. Michael Thompson .",
    );
    expect(joinCanonTextParts(["How ", "are you"])).toBe("How are you");
  });

  it("avoids the old join(' ') double-space-then-dot artifact", () => {
    const committed = "Guten Tag ";
    const live = ".";
    expect([committed, live].filter(Boolean).join(" ")).toBe("Guten Tag  .");
    expect(joinCanonTextParts([committed, live])).toBe("Guten Tag .");
  });

  it("skips empty parts", () => {
    expect(joinCanonTextParts(["Hello", "", " world"])).toBe("Hello world");
    expect(joinCanonTextParts(["", "only live"])).toBe("only live");
  });

  it("inserts a space between Arabic words when Soniox omitted it", () => {
    expect(joinCanonTextParts(["تتأكد", "هذه"])).toBe("تتأكد هذه");
    expect(joinCanonText(["تتأكد", "أنها"].map(tok))).toBe("تتأكد أنها");
  });

  it("does not insert a space inside Latin subwords (Soniox morn+ing)", () => {
    expect(joinCanonTextParts(["morn", "ing"])).toBe("morning");
  });
});

describe("joinCanonText", () => {
  it("uses the same space-safe parts helper", () => {
    expect(joinCanonText([tok("Hello "), tok(" world")])).toBe("Hello world");
  });
});
