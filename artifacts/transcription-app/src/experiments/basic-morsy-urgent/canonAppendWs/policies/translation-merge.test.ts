import { describe, expect, it } from "vitest";

import {
  mergeAppendedTranslationText,
  translationFinalFingerprint,
} from "./translation-merge";

describe("mergeAppendedTranslationText", () => {
  it("stops exact fragment re-appends (—he has loop)", () => {
    let t = "";
    t = mergeAppendedTranslationText(t, "—he has");
    expect(t).toBe("—he has");
    for (let i = 0; i < 20; i++) {
      t = mergeAppendedTranslationText(t, "—he has");
    }
    expect(t).toBe("—he has");
  });

  it("grows when Soniox extends the full translation revision", () => {
    let t = mergeAppendedTranslationText("", "حسنًا. وهل هو");
    t = mergeAppendedTranslationText(t, "حسنًا. وهل هو، ميرهام");
    expect(t).toBe("حسنًا. وهل هو، ميرهام");
  });

  it("appends sequential Soniox pieces without character-overlap splicing", () => {
    // Docs-style pieces: "Gu" + "ten" + " Morgen"
    let t = mergeAppendedTranslationText("", "سأطلق");
    t = mergeAppendedTranslationText(t, " سراح");
    t = mergeAppendedTranslationText(t, "ه");
    expect(t).toBe("سأطلق سراحه");
  });

  it("must not eat Arabic letters via fuzzy overlap (regression)", () => {
    // Character-overlap merge used to splice on "أطلق" and corrupt Arabic.
    // Safe path: simple concat of sequential Soniox pieces.
    const t = mergeAppendedTranslationText("سأطلق", "أطلقراحه");
    expect(t).toBe("سأطلقأطلقراحه");
    expect(t).not.toBe("سراحه");
  });

  it("must not mash المشكلات + المؤقتة via overlap", () => {
    const t = mergeAppendedTranslationText("إثبات المشكلات", "المؤقتة");
    expect(t).toBe("إثبات المشكلاتالمؤقتة");
    expect(t).not.toContain("المشكلاتؤقتة");
  });
});

describe("translationFinalFingerprint", () => {
  it("ignores unstable per-frame synthetic ids", () => {
    expect(
      translationFinalFingerprint({
        id: "t-12-3",
        text: "—he has",
        language: "en",
        source_language: "ar",
      }),
    ).toBe("tx:en|ar|—he has");
  });

  it("keeps durable Soniox ids", () => {
    expect(
      translationFinalFingerprint({
        id: "sx-idx-44",
        text: "—he has",
        language: "en",
        source_language: "ar",
      }),
    ).toBe("id:sx-idx-44");
  });
});
