import { describe, expect, it } from "vitest";
import { dominantBidiDir, splitBidiIslands, stripBidiControls } from "./bidi-islands";

describe("splitBidiIslands", () => {
  it("isolates a phone number as LTR inside Arabic", () => {
    const pieces = splitBidiIslands("اتصل على 050-123-4567 الآن", "rtl");
    const phone = pieces.find((p) => p.text.includes("050-123-4567"));
    expect(phone?.isolate).toBe("ltr");
    expect(pieces.some((p) => p.text.includes("اتصل") && !p.isolate)).toBe(true);
  });

  it("isolates Latin words as LTR inside Arabic", () => {
    const pieces = splitBidiIslands("استخدم Claude للبرمجة", "rtl");
    const latin = pieces.find((p) => p.text.includes("Claude"));
    expect(latin?.isolate).toBe("ltr");
  });

  it("isolates a whole English clause as one LTR run, not each word", () => {
    const text =
      "نعم، نعم. When he doesn't bring him more trouble, because the doctor told me";
    const pieces = splitBidiIslands(text, "rtl");
    const english = pieces.find((p) => p.isolate === "ltr" && p.text.includes("When he doesn't"));
    expect(english).toBeTruthy();
    expect(pieces.filter((p) => p.isolate === "ltr")).toHaveLength(1);
  });

  it("isolates Arabic words as RTL inside English", () => {
    const pieces = splitBidiIslands("Call أحمد now", "ltr");
    const ar = pieces.find((p) => p.text.includes("أحمد"));
    expect(ar?.isolate).toBe("rtl");
  });

  it("does not isolate a simple English phrase", () => {
    const pieces = splitBidiIslands("Hello world", "ltr");
    expect(pieces.every((p) => !p.isolate)).toBe(true);
    expect(pieces.map((p) => p.text).join("")).toBe("Hello world");
  });

  it("keeps digit order tokens intact", () => {
    const pieces = splitBidiIslands("الرقم 12345", "rtl");
    expect(pieces.find((p) => p.text.includes("12345"))?.isolate).toBe("ltr");
  });

  it("strips copied LRI/PDI marks before splitting", () => {
    const copied = "نعم. \u2066When\u2069 \u2066he\u2069";
    expect(stripBidiControls(copied)).toBe("نعم. When he");
    const pieces = splitBidiIslands(copied, "rtl");
    expect(pieces.some((p) => p.text.includes("When he") && p.isolate === "ltr")).toBe(true);
  });
});

describe("dominantBidiDir", () => {
  it("picks LTR when the translation is mostly English after a short Arabic yes", () => {
    const text =
      "نعم، نعم. When he doesn't bring him more trouble, because the doctor told me he should bring it";
    expect(dominantBidiDir(text, "rtl")).toBe("ltr");
  });

  it("picks RTL when the translation is mostly Arabic", () => {
    expect(dominantBidiDir("نعم، هذا كل شيء CPR", "ltr")).toBe("rtl");
  });
});
