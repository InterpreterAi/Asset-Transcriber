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

  it("does not split the row on a digit token tagged with the other language", () => {
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [
        tok(1, "رقمي", { speaker: "1", language: "ar" }),
        tok(2, " 555", { speaker: "1", language: "en" }),
        tok(3, " هو", { speaker: "1", language: "ar" }),
      ]),
      ctx(1_000, true),
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.language).toBe("ar");
    expect(utteranceCommittedText(state.activeUtterance!)).toBe("رقمي 555 هو");
  });
});

function trans(n: number, text: string, language: string, isFinal = true): Token {
  return {
    id: `tr-${n}`,
    text,
    isFinal,
    confidence: 0.95,
    language,
    translation_status: "translation",
  };
}

describe("reduceCanonAppendWs chunk-v2 translation routing", () => {
  it("keeps the translation on its own row", () => {
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok(1, "Hello", { speaker: "1", language: "en" }), trans(1, "Bonjour", "fr")]),
      ctx(1_000, true),
    );
    expect(state.activeTranslationText).toBe("Bonjour");
    expect(state.activeTranslationPreviewText).toBe("Bonjour");
  });

  it("routes a late translation back to the previous row after a language switch", () => {
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok(1, "No. Just", { speaker: "1", language: "en" })]),
      ctx(1_000, true),
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [
        tok(2, " je ne peux pas", { speaker: "1", language: "fr" }),
        trans(1, "Non. Juste", "fr"),
        trans(2, "I can't", "en"),
      ]),
      ctx(1_400, true),
    );
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(state.finalizedUtterances[0]!.translationText).toBe("Non. Juste");
    expect(state.activeUtterance?.language).toBe("fr");
    expect(state.activeTranslationText).toBe("I can't");
  });

  it("routes a late translation to the frozen row after a speaker handoff", () => {
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok(1, "Merci", { speaker: "1", language: "fr" })]),
      ctx(1_000, true),
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [tok(2, "Okay", { speaker: "2", language: "en" })]),
      ctx(1_200, true),
    );
    state = reduceCanonAppendWs(
      state,
      frame(3, [trans(1, "Thank you", "en"), trans(2, "D'accord", "fr")]),
      ctx(1_300, true),
    );
    expect(state.finalizedUtterances[0]!.translationText).toBe("Thank you");
    expect(state.activeTranslationText).toBe("D'accord");
  });

  it("shows a non-final translation only as the active row preview", () => {
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok(1, "Hello", { speaker: "1", language: "en" }), trans(1, "Bon", "fr", false)]),
      ctx(1_000, true),
    );
    expect(state.activeTranslationText).toBe("");
    expect(state.activeTranslationPreviewText).toBe("Bon");
    state = reduceCanonAppendWs(
      state,
      frame(2, [trans(2, "Bonjour", "fr")]),
      ctx(1_100, true),
    );
    expect(state.activeTranslationText).toBe("Bonjour");
    expect(state.activeTranslationPreviewText).toBe("Bonjour");
  });

  it("leaves the non-chunk path unchanged", () => {
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok(1, "Hello", { speaker: "1", language: "en" }), trans(1, "Bonjour", "fr")]),
      ctx(1_000, false),
    );
    expect(state.activeTranslationText).toBe("Bonjour");
  });
});
