import { describe, expect, it } from "vitest";

import { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import { createInitialEngineState } from "../types/transcript";
import type { Token } from "../types/tokens";
import type { SonioxFrame } from "../ws/frame-types";
import { utteranceCommittedText } from "../types/canon-utterance";
import { reduceCanonAppendWs, type ReduceContext } from "./reducer";

function tok(
  n: number,
  text: string,
  opts: { speaker: string; language: string; isFinal?: boolean },
): Token {
  return {
    id: `id-${n}`,
    text,
    isFinal: opts.isFinal ?? true,
    confidence: 0.95,
    startMs: n * 100,
    endMs: n * 100 + 80,
    speakerId: opts.speaker,
    language: opts.language,
  };
}

function frame(seq: number, tokens: Token[]): SonioxFrame {
  return { seq, tokens, endpoint: false, timestamp: 0 };
}

function ctx(wallMs: number, chunkV2: boolean): ReduceContext {
  return {
    ledger: new AppendOnlyCanonLedger(),
    wallMs,
    sameSpeakerLongPauseSplitMs: 5000,
    chunkV2NativeTranslate: chunkV2,
  };
}

describe("reduceCanonAppendWs chunk-v2 segmentation", () => {
  it("opens a new bubble after a ~5s same-speaker pause, not after a short gap", () => {
    let short = createInitialEngineState();
    short = reduceCanonAppendWs(
      short,
      frame(1, [tok(1, "Hello", { speaker: "1", language: "en" })]),
      ctx(1_000, true),
    );
    short = reduceCanonAppendWs(
      short,
      frame(2, [tok(2, " there", { speaker: "1", language: "en" })]),
      ctx(3_000, true),
    );
    expect(short.finalizedUtterances).toHaveLength(0);
    expect(utteranceCommittedText(short.activeUtterance!)).toBe("Hello there");

    let held = createInitialEngineState();
    held = reduceCanonAppendWs(
      held,
      frame(1, [tok(1, "Hello", { speaker: "1", language: "en" })]),
      ctx(1_000, true),
    );
    held = reduceCanonAppendWs(
      held,
      frame(2, [tok(2, " there", { speaker: "1", language: "en" })]),
      ctx(6_200, true),
    );
    expect(held.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(held.finalizedUtterances[0]!)).toBe("Hello");
    expect(utteranceCommittedText(held.activeUtterance!)).toBe(" there");
  });

  it("opens a new bubble on speaker change in chunk v2", () => {
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok(1, "Hello", { speaker: "1", language: "en" })]),
      ctx(1_000, true),
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [tok(2, "Hi", { speaker: "2", language: "en" })]),
      ctx(1_400, true),
    );
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).toBe("Hello");
    expect(utteranceCommittedText(state.activeUtterance!)).toBe("Hi");
  });

  it("opens a new bubble on language change with the same speaker (chunk v2 only)", () => {
    let v2 = createInitialEngineState();
    v2 = reduceCanonAppendWs(
      v2,
      frame(1, [tok(1, "Hello", { speaker: "1", language: "en" })]),
      ctx(1_000, true),
    );
    v2 = reduceCanonAppendWs(
      v2,
      frame(2, [tok(2, " مرحبا", { speaker: "1", language: "ar" })]),
      ctx(1_400, true),
    );
    expect(v2.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(v2.finalizedUtterances[0]!)).toBe("Hello");
    expect(v2.activeUtterance?.language).toBe("ar");
    expect(utteranceCommittedText(v2.activeUtterance!)).toBe(" مرحبا");

    let other = createInitialEngineState();
    other = reduceCanonAppendWs(
      other,
      frame(1, [tok(1, "Hello", { speaker: "1", language: "en" })]),
      ctx(1_000, false),
    );
    other = reduceCanonAppendWs(
      other,
      frame(2, [tok(2, " مرحبا", { speaker: "1", language: "ar" })]),
      ctx(1_400, false),
    );
    expect(other.finalizedUtterances).toHaveLength(0);
    expect(utteranceCommittedText(other.activeUtterance!)).toBe("Hello مرحبا");
  });
});
