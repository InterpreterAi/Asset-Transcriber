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
    // First new-speaker token is held off the old row.
    state = reduceCanonAppendWs(
      state,
      frame(2, [token("C.", { startMs: 80, speakerId: "2", language: "en" })], 2_000),
      { ...ctx, wallMs: 2_000 },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(utteranceCommittedText(state.activeUtterance!).trim()).toBe("S.");
    state = reduceCanonAppendWs(
      state,
      frame(3, [token("okay", { startMs: 120, speakerId: "2", language: "en" })], 2_100),
      { ...ctx, wallMs: 2_100 },
    );
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!).trim()).toBe("S.");
    expect(state.activeUtterance?.speaker).toBe("2");
    expect(utteranceCommittedText(state.activeUtterance!)).toMatch(/C\.\s*okay/);
  });
});

describe("speaker-synced rows", () => {
  it("does not paint new-speaker live text on the old row", () => {
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
      frame(
        2,
        [token("We", { startMs: 80, speakerId: "2", language: "en", isFinal: false })],
        1_080,
      ),
      { ...ctx, wallMs: 1_080 },
    );

    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("Why do marines");
    expect(state.activeUtterance!.nonFinalTokens.map(t => t.text).join("")).not.toContain("We");
  });

  it("opens a new row from substantial new-speaker live text without leaving it on the old row", () => {
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
      frame(
        2,
        [token("We got it up in the morning", { startMs: 80, speakerId: "2", language: "en", isFinal: false })],
        1_080,
      ),
      { ...ctx, wallMs: 1_080 },
    );

    expect(state.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).toContain("Why do marines");
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).not.toContain("We got");
    expect(state.activeUtterance?.speaker).toBe("2");
    expect(state.activeUtterance!.nonFinalTokens.map(t => t.text).join("")).toContain("We got it");
  });

  it("puts confirmed new-speaker finals on the new row only", () => {
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
      frame(2, [token("We got it ", { startMs: 80, speakerId: "2", language: "en" })], 1_200),
      { ...ctx, wallMs: 1_200 },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(utteranceCommittedText(state.activeUtterance!)).not.toContain("We got");

    state = reduceCanonAppendWs(
      state,
      frame(3, [token("up in the morning", { startMs: 140, speakerId: "2", language: "en" })], 1_280),
      { ...ctx, wallMs: 1_280 },
    );

    expect(state.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).toContain("Why do marines");
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).not.toContain("We got");
    expect(state.activeUtterance?.speaker).toBe("2");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("We got it");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("up in the morning");
  });

  it("does not open a second row on one-token speaker flicker", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: false };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("Hello ", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [token("there ", { startMs: 40, speakerId: "1", language: "en" })], 1_100),
      { ...ctx, wallMs: 1_100 },
    );
    state = reduceCanonAppendWs(
      state,
      frame(3, [token("friend ", { startMs: 70, speakerId: "2", language: "en" })], 1_200),
      { ...ctx, wallMs: 1_200 },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    state = reduceCanonAppendWs(
      state,
      frame(4, [token("today", { startMs: 100, speakerId: "1", language: "en" })], 1_300),
      { ...ctx, wallMs: 1_300 },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("Hello");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("today");
  });

  it("does not open a new row when only the live-tail language flickers", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: false };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("I never had a steak", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    state = reduceCanonAppendWs(
      state,
      frame(
        2,
        [token(" in the Marine Corps", { startMs: 80, speakerId: "1", language: "ar", isFinal: false })],
        1_080,
      ),
      { ...ctx, wallMs: 1_080 },
    );

    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("I never had a steak");
  });
});
