import { describe, expect, it } from "vitest";
import { shouldOpenFreshSonioxEar, tokenIsHeardSpeech } from "./ear-refresh";

describe("fresh Soniox ear", () => {
  it("does not refresh on silence or before any speech", () => {
    expect(shouldOpenFreshSonioxEar([{ text: "<end>", is_final: true }], false)).toBe(false);
    expect(shouldOpenFreshSonioxEar([{ text: "Hello", is_final: false }], true)).toBe(false);
  });

  it("refreshes after speech once the utterance endpoint is final", () => {
    expect(
      shouldOpenFreshSonioxEar(
        [
          { text: "Hello", is_final: true },
          { text: "<end>", is_final: true },
        ],
        true,
      ),
    ).toBe(true);
  });

  it("treats real words as speech and ignores the endpoint marker", () => {
    expect(tokenIsHeardSpeech({ text: "بنك" })).toBe(true);
    expect(tokenIsHeardSpeech({ text: "<end>" })).toBe(false);
    expect(tokenIsHeardSpeech({ text: "" })).toBe(false);
  });
});
