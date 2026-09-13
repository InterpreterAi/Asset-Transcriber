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

  it("does not invent spaces between Arabic tokens — Soniox owns spacing", () => {
    expect(joinCanonTextParts(["تتأكد", "هذه"])).toBe("تتأكدهذه");
    expect(joinCanonText(["مش", "عايزين"].map(tok))).toBe("مشعايزين");
    expect(joinCanonTextParts(["م", "ش", " ", "ع"])).toBe("مش ع");
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
