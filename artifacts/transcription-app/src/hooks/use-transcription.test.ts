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

  it("drops repeated trailing Arabic sentence", () => {
    const raw =
      "كيف يمكنني مساعدتك اليوم؟ كيف يمكنني مساعدتك اليوم؟";
    expect(dropTrailingRepeatedSentence(raw)).toBe("كيف يمكنني مساعدتك اليوم؟");
  });

  it("keeps distinct follow-up sentence (no false dedupe)", () => {
    const raw =
      "Puedo ayudarte con eso ahora mismo. Tambien puedo explicarte los siguientes pasos.";
    expect(dropTrailingRepeatedSentence(raw)).toBe(raw);
  });

  it("does not duplicate boundary word while appending", () => {
    const prev = "شكرا";
    const piece = "شكرا لاتصالك";
    expect(mergeStreamingTranslation(prev, piece)).toBe("شكرا لاتصالك");
  });
});

