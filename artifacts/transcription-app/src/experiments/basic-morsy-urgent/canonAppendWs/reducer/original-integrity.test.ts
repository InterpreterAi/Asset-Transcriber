/**
 * Synthetic Original-integrity checks for restored chunk-v2 path (4feb41b4 + integrity rules).
 * Run: npx vitest run src/experiments/basic-morsy-urgent/canonAppendWs/reducer/original-integrity.test.ts
 */
import { describe, expect, it } from "vitest";

import { AppendOnlyCanonLedger } from "../ledger/append-ledger";
import { projectTranscriptView } from "../projection/transcript-view";
import { reduceCanonAppendWs } from "./reducer";
import { createInitialEngineState } from "../types/transcript";
import type { SonioxFrame } from "../ws/frame-types";
import type { Token } from "../types/tokens";
import { applyGlossaryPostProcess } from "../utils/glossary-post-process";
import { stableSonioxTokenId } from "../policies/token-identity";
import { joinCanonText } from "../types/canon-token";
import { freezeActiveUtterance } from "./row-lifecycle";

function tok(
  text: string,
  opts: Partial<Token> & { id: string; isFinal?: boolean } ,
): Token {
  return {
    id: opts.id,
    text,
    isFinal: opts.isFinal ?? true,
    confidence: 1,
    startMs: opts.startMs,
    endMs: opts.endMs,
    speakerId: opts.speakerId,
    language: opts.language,
    translation_status: opts.translation_status,
  };
}

function frame(seq: number, tokens: Token[], endpoint = false): SonioxFrame {
  return {
    seq,
    tokens,
    endpoint,
    timestamp: seq * 10,
  };
}

function reduceAll(frames: SonioxFrame[]) {
  const ledger = new AppendOnlyCanonLedger();
  let state = createInitialEngineState();
  let wall = 1_000;
  for (const f of frames) {
    wall += 50;
    state = reduceCanonAppendWs(state, f, { ledger, wallMs: wall, chunkV2NativeTranslate: true });
  }
  return state;
}

describe("chunk-v2 Original integrity (restored path)", () => {
  it('keeps "No nodules seen." unchanged after row closure', () => {
    const state = reduceAll([
      frame(1, [
        tok("No", { id: "a1", speakerId: "1", language: "en", startMs: 0, endMs: 100 }),
        tok(" nodules", { id: "a2", speakerId: "1", language: "en", startMs: 100, endMs: 200 }),
        tok(" seen", { id: "a3", speakerId: "1", language: "en", startMs: 200, endMs: 300 }),
        tok(".", { id: "a4", speakerId: "1", language: "en", startMs: 300, endMs: 320 }),
      ], true),
    ]);
    const frozen = freezeActiveUtterance(state);
    const proj = projectTranscriptView(frozen, { chunkV2NativeTranslate: true });
    expect(proj.rows[0]?.committedText).toBe("No nodules seen.");
  });

  it('keeps "Not notified yet." unchanged after row closure', () => {
    const state = reduceAll([
      frame(1, [
        tok("Not", { id: "b1", speakerId: "1", language: "en", startMs: 0 }),
        tok(" notified", { id: "b2", speakerId: "1", language: "en", startMs: 80 }),
        tok(" yet", { id: "b3", speakerId: "1", language: "en", startMs: 160 }),
        tok(".", { id: "b4", speakerId: "1", language: "en", startMs: 200 }),
      ], true),
    ]);
    const frozen = freezeActiveUtterance(state);
    const proj = projectTranscriptView(frozen, { chunkV2NativeTranslate: true });
    expect(proj.rows[0]?.committedText).toBe("Not notified yet.");
  });

  it('preserves space between confirmed "How " and temporary "are you"', () => {
    let state = createInitialEngineState();
    const ledger = new AppendOnlyCanonLedger();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok("How ", { id: "c1", isFinal: true, speakerId: "1", language: "en" })]),
      { ledger, wallMs: 1000, chunkV2NativeTranslate: true },
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [
        tok("How ", { id: "c1", isFinal: true, speakerId: "1", language: "en" }),
        tok("are you", { id: "c2", isFinal: false, speakerId: "1", language: "en" }),
      ]),
      { ledger, wallMs: 1050, chunkV2NativeTranslate: true },
    );
    const proj = projectTranscriptView(state, { chunkV2NativeTranslate: true });
    const row = proj.rows[0]!;
    expect(row.committedText).toBe("How ");
    expect(row.liveText).toBe("are you");
    expect(row.committedText + row.liveText).toBe("How are you");
  });

  it('keeps short patient "No." under that patient speaker', () => {
    const state = reduceAll([
      frame(1, [
        tok("How are you?", { id: "d0", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok("No.", { id: "d1", speakerId: "2", language: "en", startMs: 500 }),
      ]),
    ]);
    // Speaker change freezes prior row; short answer must remain on speaker 2.
    const proj = projectTranscriptView(
      freezeActiveUtterance(state),
      { chunkV2NativeTranslate: true },
    );
    const patient = proj.rows.find(r => r.speaker === "2");
    expect(patient?.committedText).toBe("No.");
  });

  it("keeps distinct tokens that share timestamps", () => {
    const state = reduceAll([
      frame(1, [
        tok("alpha", { id: "e1", speakerId: "1", language: "en", startMs: 100, endMs: 200 }),
        tok(" beta", { id: "e2", speakerId: "1", language: "en", startMs: 100, endMs: 200 }),
      ]),
    ]);
    const au = state.activeUtterance!;
    expect(au.finalTokens).toHaveLength(2);
    expect(joinCanonText(au.finalTokens)).toBe("alpha beta");
  });

  it("does not apply client glossary force on restored path", () => {
    expect(
      applyGlossaryPostProcess("Hello world", [{ source: "Hello", target: "Hi" }]),
    ).toBe("Hello world");
  });

  it("polishes translation dialect to MSA when direction opts are provided", () => {
    expect(
      applyGlossaryPostProcess("نعم ليش", [], {
        rowSourceLanguage: "en",
        langA: "en",
        langB: "ar",
      }),
    ).toBe("نعم لماذا");
  });

  it("scopes token ids per message so reconnects do not collide", () => {
    const a = stableSonioxTokenId({ messageSeq: 1, arrIndex: 0, start_ms: 10, end_ms: 20 });
    const b = stableSonioxTokenId({ messageSeq: 2, arrIndex: 0, start_ms: 10, end_ms: 20 });
    expect(a).not.toBe(b);
  });

  it("replaces temporary hypotheses without promoting them to confirmed", () => {
    let state = createInitialEngineState();
    const ledger = new AppendOnlyCanonLedger();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok("hello", { id: "f1", isFinal: false, speakerId: "1", language: "en" })]),
      { ledger, wallMs: 1000, chunkV2NativeTranslate: true },
    );
    expect(state.activeUtterance?.finalTokens).toHaveLength(0);
    expect(state.activeUtterance?.nonFinalTokens.map(t => t.text).join("")).toBe("hello");
    state = reduceCanonAppendWs(
      state,
      frame(2, [tok("hello there", { id: "f2", isFinal: false, speakerId: "1", language: "en" })]),
      { ledger, wallMs: 1050, chunkV2NativeTranslate: true },
    );
    expect(state.activeUtterance?.finalTokens).toHaveLength(0);
    expect(state.activeUtterance?.nonFinalTokens.map(t => t.text).join("")).toBe("hello there");
  });

  it("stop/freeze keeps confirmed Original and drops only temporary paint", () => {
    let state = createInitialEngineState();
    const ledger = new AppendOnlyCanonLedger();
    state = reduceCanonAppendWs(
      state,
      frame(1, [
        tok("Confirmed ", { id: "g1", isFinal: true, speakerId: "1", language: "en" }),
        tok("draft", { id: "g2", isFinal: false, speakerId: "1", language: "en" }),
      ]),
      { ledger, wallMs: 1000, chunkV2NativeTranslate: true },
    );
    const frozen = freezeActiveUtterance(state);
    const proj = projectTranscriptView(frozen, { chunkV2NativeTranslate: true });
    expect(proj.rows[0]?.committedText).toBe("Confirmed ");
    expect(proj.rows[0]?.liveText).toBe("");
    expect(joinCanonText(frozen.finalizedUtterances[0]!.finalTokens)).toBe("Confirmed ");
  });
});
