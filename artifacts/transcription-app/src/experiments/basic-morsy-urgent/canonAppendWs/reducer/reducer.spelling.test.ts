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
    // One stray speaker flip must not open a row (confirm = 2).
    state = reduceCanonAppendWs(
      state,
      frame(2, [token("C.", { startMs: 80, speakerId: "2", language: "en" })], 2_000),
      { ...ctx, wallMs: 2_000 },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    // Second consecutive final from speaker 2 confirms the handoff.
    state = reduceCanonAppendWs(
      state,
      frame(3, [token("okay", { startMs: 120, speakerId: "2", language: "en" })], 2_100),
      { ...ctx, wallMs: 2_100 },
    );
    expect(state.finalizedUtterances.length).toBeGreaterThanOrEqual(1);
  });

  it("does not open a second row on a single Soniox speaker flicker", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: true };

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
    // One-token diarization glitch to speaker 2 — must stay on the same row.
    state = reduceCanonAppendWs(
      state,
      frame(3, [token("friend ", { startMs: 70, speakerId: "2", language: "en" })], 1_200),
      { ...ctx, wallMs: 1_200 },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    // Back to speaker 1 — still one row.
    state = reduceCanonAppendWs(
      state,
      frame(4, [token("today", { startMs: 100, speakerId: "1", language: "en" })], 1_300),
      { ...ctx, wallMs: 1_300 },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(utteranceCommittedText(state.activeUtterance!).replace(/\s+/g, " ").trim()).toContain("Hello");
    expect(utteranceCommittedText(state.activeUtterance!).replace(/\s+/g, " ").trim()).toContain("today");
  });
});

describe("stable per-speaker rows", () => {
  it("does not split mid-word when the non-final tail language flickers", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: false };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("swab in the v", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    state = reduceCanonAppendWs(
      state,
      frame(
        2,
        [
          token("agina that's looking", {
            startMs: 40,
            speakerId: "1",
            language: "ar",
            isFinal: false,
          }),
        ],
        1_080,
      ),
      { ...ctx, wallMs: 1_080 },
    );

    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    expect(utteranceCommittedText(state.activeUtterance!).trim()).toBe("swab in the v");
  });

  it("does not open a new row on one-token language+speaker flicker", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: false };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("v", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [token("agina", { startMs: 40, speakerId: "2", language: "ar" })], 1_100),
      { ...ctx, wallMs: 1_100 },
    );

    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    expect(utteranceCommittedText(state.activeUtterance!).replace(/\s+/g, " ").trim()).toMatch(/v\s*agina/);
  });

  it("opens a new row after two confirmed finals from a different speaker", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: false };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("Okay. ", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [token("And if it's ", { startMs: 80, speakerId: "2", language: "en" })], 1_200),
      { ...ctx, wallMs: 1_200 },
    );
    state = reduceCanonAppendWs(
      state,
      frame(3, [token("positive", { startMs: 140, speakerId: "2", language: "en" })], 1_280),
      { ...ctx, wallMs: 1_280 },
    );

    expect(state.finalizedUtterances).toHaveLength(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!).trim()).toMatch(/Okay/);
    expect(state.activeUtterance?.speaker).toBe("2");
  });

  it("keeps one row when the same speaker code-switches language", () => {
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
      frame(2, [token("مرحبا", { startMs: 80, speakerId: "1", language: "ar" })], 1_200),
      { ...ctx, wallMs: 1_200 },
    );

    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("Hello");
    expect(utteranceCommittedText(state.activeUtterance!)).toContain("مرحبا");
  });
});
