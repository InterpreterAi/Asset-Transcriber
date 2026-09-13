import { describe, expect, it } from "vitest";
import {
  collapseConsecutiveShortAckSegments,
  collapseInternalShortAckSpam,
  shouldSkipDuplicateShortAckFinal,
} from "./short-ack-collapse";
import { createInitialEngineState } from "../types/transcript";
import type { CanonToken } from "../types/canon-token";

function tok(partial: Partial<CanonToken> & Pick<CanonToken, "token_id" | "text">): CanonToken {
  return {
    is_final: true,
    start_ms: 0,
    end_ms: 100,
    ...partial,
  };
}

describe("collapseInternalShortAckSpam", () => {
  it("collapses repeated تمام sentences to one", () => {
    const spam = "تمام. تمام. تمام. تمام. تمام. تمام.";
    expect(collapseInternalShortAckSpam(spam)).toBe("تمام.");
  });

  it("collapses repeated لا لا sentences to one", () => {
    const spam = Array.from({ length: 12 }, () => "لا لا.").join(" ");
    expect(collapseInternalShortAckSpam(spam)).toBe("لا لا.");
  });

  it("collapses a storm of bare لا words to at most two", () => {
    const spam = Array.from({ length: 40 }, () => "لا").join(" ");
    expect(collapseInternalShortAckSpam(spam)).toBe("لا لا");
  });

  it("does not collapse distinct short acks", () => {
    expect(collapseInternalShortAckSpam("نعم. تمام.")).toBe("نعم. تمام.");
  });
});

describe("shouldSkipDuplicateShortAckFinal", () => {
  it("skips identical short ack within 500ms", () => {
    let state = createInitialEngineState();
    state = {
      ...state,
      activeUtterance: {
        utterance_id: "u1",
        finalTokens: [tok({ token_id: "a", text: "تمام.", start_ms: 1000, end_ms: 1200 })],
        nonFinalTokens: [],
        speaker: "1",
        language: "ar",
        is_final: false,
      },
    };
    const incoming = tok({ token_id: "b", text: "تمام.", start_ms: 1250, end_ms: 1400 });
    expect(shouldSkipDuplicateShortAckFinal(state, incoming)).toBe(true);
  });

  it("keeps a later identical ack after a real pause", () => {
    let state = createInitialEngineState();
    state = {
      ...state,
      activeUtterance: {
        utterance_id: "u1",
        finalTokens: [tok({ token_id: "a", text: "تمام.", start_ms: 1000, end_ms: 1200 })],
        nonFinalTokens: [],
        speaker: "1",
        language: "ar",
        is_final: false,
      },
    };
    const incoming = tok({ token_id: "b", text: "تمام.", start_ms: 2200, end_ms: 2400 });
    expect(shouldSkipDuplicateShortAckFinal(state, incoming)).toBe(false);
  });
});

describe("collapseConsecutiveShortAckSegments", () => {
  it("dedupes translation column short-ack runs", () => {
    expect(collapseConsecutiveShortAckSegments("Okay. Okay. Okay.")).toBe("Okay.");
  });
});
