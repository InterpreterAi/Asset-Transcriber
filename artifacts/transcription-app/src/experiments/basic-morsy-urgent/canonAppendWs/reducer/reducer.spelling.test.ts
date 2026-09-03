import { describe, expect, it } from "vitest";

import { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import { createInitialEngineState } from "../types/transcript";
import type { Token } from "../types/tokens";
import type { SonioxFrame } from "../ws/frame-types";
import { reduceCanonAppendWs } from "./reducer";
import { utteranceCommittedText } from "../types/canon-utterance";

function token(text: string, extra: Partial<Token> = {}): Token {
  return {
    id: extra.id ?? `id-${text}-${extra.startMs ?? 0}`,
    text,
    isFinal: extra.isFinal ?? true,
    confidence: extra.confidence ?? 0.9,
    startMs: extra.startMs,
    speakerId: extra.speakerId,
    language: extra.language,
    translation_status: extra.translation_status ?? "original",
  };
}

function frame(seq: number, tokens: Token[], timestamp: number): SonioxFrame {
  return { seq, tokens, endpoint: false, timestamp };
}

describe("Soniox-native spelled email hold", () => {
  it("keeps S. then C. on one row and still splits on Uh-huh", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: true };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("S.", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(utteranceCommittedText(state.activeUtterance!).trim()).toBe("S.");

    state = reduceCanonAppendWs(
      state,
      frame(2, [token("C.", { startMs: 80, speakerId: "2", language: "ar" })], 2_000),
      { ...ctx, wallMs: 2_000 },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(utteranceCommittedText(state.activeUtterance!).replace(/\s+/g, " ").trim()).toMatch(/S\.\s*C\./);

    state = reduceCanonAppendWs(
      state,
      frame(3, [token("Uh-huh", { startMs: 200, speakerId: "2", language: "en" })], 8_000),
      { ...ctx, wallMs: 8_000 },
    );
    expect(state.finalizedUtterances.length).toBeGreaterThanOrEqual(1);
  });

  it("does not hold spelled scraps when Soniox-native translation is off", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: false };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("S.", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    // Aug 25: confirm = 1 — first new-speaker token opens the next row immediately.
    state = reduceCanonAppendWs(
      state,
      frame(2, [token("C.", { startMs: 80, speakerId: "2", language: "en" })], 2_000),
      { ...ctx, wallMs: 2_000 },
    );
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!).trim()).toBe("S.");
    expect(state.activeUtterance?.speaker).toBe("2");
    expect(utteranceCommittedText(state.activeUtterance!).trim()).toBe("C.");
  });

  it("opens a new colored row on the first token from a different speaker", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: false };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("Why do marines get steak and eggs", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [token("We got it up in the morning", { startMs: 80, speakerId: "2", language: "en" })], 1_200),
      { ...ctx, wallMs: 1_200 },
    );

    expect(state.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).toContain("Why do marines");
    expect(state.activeUtterance?.speaker).toBe("2");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("We got it");
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).not.toContain("We got");
  });
});
