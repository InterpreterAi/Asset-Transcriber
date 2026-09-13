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
import { utteranceCommittedText } from "../types/canon-utterance";
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
    // One conflicting final is held pending (N=2); freeze force-confirms the handoff.
    const proj = projectTranscriptView(
      freezeActiveUtterance(state),
      { chunkV2NativeTranslate: true },
    );
    const patient = proj.rows.find(r => r.speaker === "2");
    expect(patient?.committedText).toBe("No.");
  });

  it("does not freeze on a single language-flicker final (needs N=2)", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello there.", { id: "l1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" عندي ألم شديد", { id: "l2", speakerId: "1", language: "ar", startMs: 100 }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.pendingSpeakerFinals).toHaveLength(1);
    expect(state.activeUtterance && utteranceCommittedText(state.activeUtterance)).toBe("Hello there.");
  });

  it("freezes after two consecutive language-agreeing finals", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello there.", { id: "m1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" عندي ألم", { id: "m2", speakerId: "1", language: "ar", startMs: 100 }),
      ]),
      frame(3, [
        tok(" في الأنف اليوم", { id: "m3", speakerId: "1", language: "ar", startMs: 200 }),
      ]),
    ]);
    expect(state.finalizedUtterances.length).toBeGreaterThanOrEqual(1);
    expect(state.finalizedUtterances[0] && utteranceCommittedText(state.finalizedUtterances[0]!)).toBe(
      "Hello there.",
    );
    const activeText = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(activeText).toContain("عندي");
    expect(activeText).toContain("الأنف");
  });

  it("does not freeze on a single speaker-flicker final (needs N=2)", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello doctor.", { id: "s1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" wait", { id: "s2", speakerId: "2", language: "en", startMs: 100 }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.pendingSpeakerFinals).toHaveLength(1);
    expect(state.activeUtterance && utteranceCommittedText(state.activeUtterance)).toBe("Hello doctor.");
  });

  it("does not paint pending speaker-break live text onto the old row", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello doctor.", { id: "pb1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" I", { id: "pb2", speakerId: "2", language: "en", startMs: 100, isFinal: true }),
        tok(" have", { id: "pb3", speakerId: "2", language: "en", startMs: 150, isFinal: false }),
      ]),
    ]);
    expect(state.pendingSpeakerFinals).toHaveLength(1);
    expect(state.activeUtterance?.nonFinalTokens ?? []).toHaveLength(0);
    const proj = projectTranscriptView(state, { chunkV2NativeTranslate: true });
    const active = proj.rows.find(r => !r.finalized);
    expect(active?.committedText).toBe("Hello doctor.");
    expect(active?.liveText).toBe("");
    expect(active?.committedText + (active?.liveText ?? "")).not.toContain("have");
  });

  it("does not paint pending language-break live text onto the old row", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello there.", { id: "pl1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" عندي ألم شديد", { id: "pl2", speakerId: "1", language: "ar", startMs: 100, isFinal: true }),
        tok(" في الأنف", { id: "pl3", speakerId: "1", language: "ar", startMs: 150, isFinal: false }),
      ]),
    ]);
    expect(state.pendingSpeakerFinals).toHaveLength(1);
    expect(state.finalizedUtterances).toHaveLength(0);
    const proj = projectTranscriptView(state, { chunkV2NativeTranslate: true });
    const active = proj.rows.find(r => !r.finalized);
    expect(active?.committedText).toBe("Hello there.");
    expect(active?.liveText).toBe("");
    expect(active?.committedText + (active?.liveText ?? "")).not.toMatch(/عندي|الأنف/);
  });

  it("freezes after two consecutive speaker-agreeing finals", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello doctor.", { id: "t1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" I", { id: "t2", speakerId: "2", language: "en", startMs: 100 }),
      ]),
      frame(3, [
        tok(" have pain", { id: "t3", speakerId: "2", language: "en", startMs: 200 }),
      ]),
    ]);
    expect(state.finalizedUtterances.length).toBeGreaterThanOrEqual(1);
    expect(state.activeUtterance?.speaker).toBe("2");
    const activeText = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(activeText).toContain("I");
    expect(activeText).toContain("have pain");
    // First pending word must lead the new row — not start at the second final.
    expect(activeText?.trimStart().startsWith("I")).toBe(true);
  });

  it("absorbs a rejected speaker flicker back onto the old row", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello doctor.", { id: "ab1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" wait", { id: "ab2", speakerId: "2", language: "en", startMs: 100 }),
      ]),
      frame(3, [
        tok(" please", { id: "ab3", speakerId: "1", language: "en", startMs: 200 }),
      ]),
    ]);
    expect(state.pendingSpeakerFinals).toHaveLength(0);
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("1");
    const text = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(text).toContain("Hello doctor.");
    expect(text).toContain("wait");
    expect(text).toContain("please");
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

  it("absorbs short-ack language flicker into the open row", () => {
    const state = reduceAll([
      frame(1, [
        tok("How are you", { id: "h1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok("ها؟", { id: "h2", speakerId: "1", language: "ar", startMs: 200 }),
      ]),
      frame(3, [
        tok(" feeling", { id: "h3", speakerId: "1", language: "en", startMs: 400 }),
      ]),
    ]);
    const frozen = freezeActiveUtterance(state);
    const proj = projectTranscriptView(frozen, { chunkV2NativeTranslate: true });
    expect(proj.rows).toHaveLength(1);
    expect(proj.rows[0]?.committedText).toContain("How are you");
    expect(proj.rows[0]?.committedText).toContain("ها؟");
    expect(proj.rows[0]?.committedText).toContain("feeling");
  });

  it("does not glue a real language-switch short ack onto the previous row", () => {
    const state = reduceAll([
      frame(1, [
        tok("Sí, la factura es correcta.", {
          id: "sw1",
          speakerId: "1",
          language: "es",
          startMs: 0,
          endMs: 800,
        }),
      ]),
      frame(2, [
        tok(" Perfect.", {
          id: "sw2",
          speakerId: "1",
          language: "en",
          startMs: 900,
          endMs: 1100,
        }),
      ]),
      frame(3, [
        tok(" Also, the server returned a 503.", {
          id: "sw3",
          speakerId: "1",
          language: "en",
          startMs: 1200,
          endMs: 2000,
        }),
      ]),
    ]);
    const frozen = freezeActiveUtterance(state);
    const proj = projectTranscriptView(frozen, { chunkV2NativeTranslate: true });
    const esRow = proj.rows.find(r => r.committedText.includes("factura"));
    const enRow = proj.rows.find(r => r.committedText.includes("503"));
    expect(esRow?.committedText).toContain("Sí, la factura es correcta.");
    expect(esRow?.committedText ?? "").not.toContain("Perfect");
    expect(enRow?.committedText).toContain("Perfect");
    expect(enRow?.committedText).toContain("503");
  });

  it("does not pause-split an acknowledgement-only row", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [tok("Okay.", { id: "i1", speakerId: "1", language: "en", startMs: 0, endMs: 80 })]),
      { ledger, wallMs: 1000, chunkV2NativeTranslate: true, sameSpeakerLongPauseSplitMs: 100 },
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [tok(" Good.", { id: "i2", speakerId: "1", language: "en", startMs: 50, endMs: 120 })]),
      { ledger, wallMs: 5000, chunkV2NativeTranslate: true, sameSpeakerLongPauseSplitMs: 100 },
    );
    const frozen = freezeActiveUtterance(state);
    const proj = projectTranscriptView(frozen, { chunkV2NativeTranslate: true });
    expect(proj.rows).toHaveLength(1);
    expect(proj.rows[0]?.committedText).toContain("Okay.");
    expect(proj.rows[0]?.committedText).toContain("Good.");
  });

  it("does not pause-split on client delivery delay when audio gap is short", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [
        tok("$7.2 million. The.", {
          id: "p1",
          speakerId: "1",
          language: "en",
          startMs: 1000,
          endMs: 2500,
        }),
      ]),
      { ledger, wallMs: 10_000, chunkV2NativeTranslate: true },
    );
    // 8s wall-clock stall (Soniox finalization latency) but only 300ms of audio silence.
    state = reduceCanonAppendWs(
      state,
      frame(2, [
        tok(" Medication dosage is 0.75 mg/kg.", {
          id: "p2",
          speakerId: "1",
          language: "en",
          startMs: 2800,
          endMs: 4200,
        }),
      ]),
      { ledger, wallMs: 18_000, chunkV2NativeTranslate: true },
    );
    expect(state.finalizedUtterances).toHaveLength(0);
    const text = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(text).toContain("$7.2 million. The.");
    expect(text).toContain("Medication dosage");
  });

  it("pause-splits when Soniox audio silence is >= threshold even if wall-clock is fast", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [
        tok("First sentence ends here.", {
          id: "q1",
          speakerId: "1",
          language: "en",
          startMs: 0,
          endMs: 2000,
        }),
      ]),
      { ledger, wallMs: 1000, chunkV2NativeTranslate: true },
    );
    state = reduceCanonAppendWs(
      state,
      frame(2, [
        tok(" After a long audio pause.", {
          id: "q2",
          speakerId: "1",
          language: "en",
          startMs: 7500,
          endMs: 9000,
        }),
      ]),
      { ledger, wallMs: 1100, chunkV2NativeTranslate: true },
    );
    expect(state.finalizedUtterances.length).toBeGreaterThanOrEqual(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).toContain("First sentence");
    expect(state.activeUtterance && utteranceCommittedText(state.activeUtterance)).toContain(
      "long audio pause",
    );
  });

  it('keeps "Good mor" + "ning." in one bubble across language flicker', () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello. ", { id: "j1", speakerId: "1", language: "en", startMs: 0 }),
        tok("Good ", { id: "j2", speakerId: "1", language: "en", startMs: 50 }),
        tok("mor", { id: "j3", speakerId: "1", language: "en", startMs: 100 }),
      ]),
      frame(2, [
        tok("ning.", { id: "j4", speakerId: "1", language: "ar", startMs: 150 }),
      ]),
    ]);
    const frozen = freezeActiveUtterance(state);
    const proj = projectTranscriptView(frozen, { chunkV2NativeTranslate: true });
    expect(proj.rows).toHaveLength(1);
    expect(proj.rows[0]?.committedText).toBe("Hello. Good morning.");
  });

  it("still opens a new bubble for a real language switch after a finished word", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello.", { id: "k1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" عندي ألم في الأنف", { id: "k2", speakerId: "1", language: "ar", startMs: 200 }),
      ]),
      frame(3, [
        tok(" اليوم", { id: "k3", speakerId: "1", language: "ar", startMs: 400 }),
      ]),
    ]);
    const frozen = freezeActiveUtterance(state);
    const proj = projectTranscriptView(frozen, { chunkV2NativeTranslate: true });
    expect(proj.rows.length).toBeGreaterThanOrEqual(2);
    expect(proj.rows[0]?.committedText).toBe("Hello.");
    expect(proj.rows[1]?.committedText).toContain("ألم");
  });

  it("does not open a new bubble on mid-monologue same-speaker language flicker", () => {
    const state = reduceAll([
      frame(1, [
        tok("We're currently in Korea and we're going", {
          id: "mm1",
          speakerId: "1",
          language: "en",
          startMs: 0,
          endMs: 800,
        }),
      ]),
      frame(2, [
        tok(" to get the magic straight perm", {
          id: "mm2",
          speakerId: "1",
          language: "ar",
          startMs: 850,
          endMs: 1400,
        }),
      ]),
      frame(3, [
        tok(" that every Korean person has", {
          id: "mm3",
          speakerId: "1",
          language: "en",
          startMs: 1450,
          endMs: 2000,
        }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.pendingSpeakerFinals).toHaveLength(0);
    const text = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(text).toContain("Korea");
    expect(text).toContain("magic straight perm");
    expect(text).toContain("Korean person");
  });
});
