import { describe, expect, it } from "vitest";
import { dropTrailingRepeatedSentence, mergeStreamingTranslation } from "./use-transcription";

describe("translation merge regressions", () => {
  it("keeps overlap append behavior for incremental pieces", () => {
    const prev = "can you tell me your name";
    const piece = "name and date of birth";
    expect(mergeStreamingTranslation(prev, piece)).toBe("can you tell me your name and date of birth");
  });

  it("prefers coherent near-full rewrite instead of duplicating", () => {
    const prev = "i can help you today with your account and billing question";
    const rewrite = "i can help you today with your account and billing questions";
    expect(mergeStreamingTranslation(prev, rewrite)).toBe(rewrite);
  });

  it("drops repeated trailing sentence across languages", () => {
    const raw =
      "Puedo ayudarte con eso ahora mismo. Puedo ayudarte con eso ahora mismo.";
    expect(dropTrailingRepeatedSentence(raw)).toBe("Puedo ayudarte con eso ahora mismo.");
  });
});

