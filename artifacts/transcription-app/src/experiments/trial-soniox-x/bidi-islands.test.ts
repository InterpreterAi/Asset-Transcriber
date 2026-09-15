import { describe, expect, it } from "vitest";
import { splitBidiIslands } from "./bidi-islands";

describe("splitBidiIslands", () => {
  it("isolates a phone number as LTR inside Arabic", () => {
    const pieces = splitBidiIslands("اتصل على 050-123-4567 الآن", "rtl");
    const phone = pieces.find((p) => p.text.includes("050-123-4567"));
    expect(phone?.isolate).toBe("ltr");
    expect(pieces.some((p) => p.text.includes("اتصل") && !p.isolate)).toBe(true);
  });

  it("isolates Latin words as LTR inside Arabic", () => {
    const pieces = splitBidiIslands("استخدم Claude للبرمجة", "rtl");
    const latin = pieces.find((p) => p.text === "Claude");
    expect(latin?.isolate).toBe("ltr");
  });

  it("isolates Arabic words as RTL inside English", () => {
    const pieces = splitBidiIslands("Call أحمد now", "ltr");
    const ar = pieces.find((p) => p.text === "أحمد");
    expect(ar?.isolate).toBe("rtl");
  });

  it("does not isolate a simple English phrase", () => {
    const pieces = splitBidiIslands("Hello world", "ltr");
    expect(pieces.every((p) => !p.isolate)).toBe(true);
    expect(pieces.map((p) => p.text).join("")).toBe("Hello world");
  });

  it("keeps digit order tokens intact", () => {
    const pieces = splitBidiIslands("الرقم 12345", "rtl");
    expect(pieces.find((p) => p.text === "12345")?.isolate).toBe("ltr");
  });
});
