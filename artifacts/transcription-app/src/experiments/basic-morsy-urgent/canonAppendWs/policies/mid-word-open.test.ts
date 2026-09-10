import { describe, expect, it } from "vitest";

import { isChunkV2OpenRowMidWord } from "./mid-word-open";

describe("isChunkV2OpenRowMidWord", () => {
  it("detects incomplete English stems", () => {
    expect(isChunkV2OpenRowMidWord("Hello. Good mor")).toBe(true);
    expect(isChunkV2OpenRowMidWord("morn")).toBe(true);
  });

  it("treats finished words / punctuation as boundaries", () => {
    expect(isChunkV2OpenRowMidWord("Hello. ")).toBe(false);
    expect(isChunkV2OpenRowMidWord("Hello.")).toBe(false);
    expect(isChunkV2OpenRowMidWord("Good ")).toBe(false);
    expect(isChunkV2OpenRowMidWord("")).toBe(false);
  });
});
