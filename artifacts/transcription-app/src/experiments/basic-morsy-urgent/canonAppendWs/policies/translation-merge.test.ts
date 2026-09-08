import { describe, expect, it } from "vitest";

import {
  joinTranslationPieces,
  joinTranslationTokenTexts,
  mergeAppendedTranslationText,
  translationFinalFingerprint,
  translationPreviewBeyondFinal,
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
    expect(t).toBe("سأطلق أطلقراحه");
    expect(t).not.toBe("سراحه");
  });

  it("inserts Arabic word-boundary spaces instead of glue", () => {
    const t = mergeAppendedTranslationText("إثبات المشكلات", "المؤقتة");
    expect(t).toBe("إثبات المشكلات المؤقتة");
    expect(t).not.toContain("المشكلاتؤقتة");
  });

  it("keeps short Arabic clitics glued (سأطلق + ه)", () => {
    expect(joinTranslationPieces("سأطلق", "ه")).toBe("سأطلقه");
  });

  it("spaces Arabic full words (تريد + طرد)", () => {
    expect(joinTranslationPieces("تريد", "طرد")).toBe("تريد طرد");
    expect(joinTranslationTokenTexts(["من", "أجله"])).toBe("من أجله");
  });

  it("preserves Latin subword concat without inventing spaces", () => {
    expect(joinTranslationTokenTexts(["Gu", "ten", " Morgen"])).toBe("Guten Morgen");
  });

  it("grows truncated durable revision via startsWith replace", () => {
    let t = mergeAppendedTranslationText("", "إحض");
    t = mergeAppendedTranslationText(t, "إحضار الرجل");
    expect(t).toBe("إحضار الرجل");
  });
});

describe("translationPreviewBeyondFinal", () => {
  it("strips restated finalized prefix from non-final preview", () => {
    expect(
      translationPreviewBeyondFinal(
        "Lord Commander, how can I help",
        "Lord Commander, how can I help you?",
      ),
    ).toBe(" you?");
  });

  it("returns empty when preview is already covered by finals", () => {
    expect(translationPreviewBeyondFinal("نعم، ستفعل.", "ستفعل.")).toBe("");
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

  it("keeps durable Soniox ids with text so revisions are not frozen", () => {
    expect(
      translationFinalFingerprint({
        id: "sx-idx-44",
        text: "إحض",
        language: "ar",
        source_language: "en",
      }),
    ).toBe("id:sx-idx-44|إحض");
    expect(
      translationFinalFingerprint({
        id: "sx-idx-44",
        text: "إحضار",
        language: "ar",
        source_language: "en",
      }),
    ).toBe("id:sx-idx-44|إحضار");
  });
});
