import { describe, expect, it } from "vitest";

import type { CanonToken } from "../types/canon-token";
import { stabilizeCanonSpeakers } from "./soniox-frame-split";

function tok(text: string, speaker: string): CanonToken {
  return { token_id: text, text, is_final: true, speaker };
}

describe("stabilizeCanonSpeakers", () => {
  it("keeps a short same-language new-speaker tail (two males on one frame)", () => {
    const out = stabilizeCanonSpeakers([
      tok("Hello doctor.", "1"),
      tok(" Yeah I know.", "2"),
    ]);
    expect(out.map(t => t.speaker)).toEqual(["1", "2"]);
  });

  it("keeps a two-token new-speaker tail", () => {
    const out = stabilizeCanonSpeakers([
      tok("How are you?", "1"),
      tok(" Fine", "2"),
      tok(" thanks.", "2"),
    ]);
    expect(out.map(t => t.speaker)).toEqual(["1", "2", "2"]);
  });

  it("still collapses interior one-token A→B→A flicker", () => {
    const out = stabilizeCanonSpeakers([
      tok("Hello ", "1"),
      tok("there", "2"),
      tok(" doctor.", "1"),
    ]);
    expect(out.map(t => t.speaker)).toEqual(["1", "1", "1"]);
  });
});
