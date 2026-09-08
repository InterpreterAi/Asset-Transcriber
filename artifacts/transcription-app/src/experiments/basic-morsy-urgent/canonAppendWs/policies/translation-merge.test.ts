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

  it("grows when Soniox extends the translation", () => {
    let t = mergeAppendedTranslationText("", "حسنًا. وهل هو");
    t = mergeAppendedTranslationText(t, "حسنًا. وهل هو، ميرهام");
    expect(t).toBe("حسنًا. وهل هو، ميرهام");
  });

  it("merges overlapping tails without doubling", () => {
    const t = mergeAppendedTranslationText("Hello wor", "world");
    expect(t).toBe("Hello world");
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
