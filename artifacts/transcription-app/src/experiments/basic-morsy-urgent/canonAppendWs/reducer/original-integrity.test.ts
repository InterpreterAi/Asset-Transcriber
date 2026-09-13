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

  it('keeps short patient "No." on a new bubble on first final (N=1 live)', () => {
    const state = reduceAll([
      frame(1, [
        tok("How are you?", { id: "d0", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok("No.", { id: "d1", speakerId: "2", language: "en", startMs: 500 }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(state.pendingSpeakerFinals).toHaveLength(0);
    const proj = projectTranscriptView(state, { chunkV2NativeTranslate: true });
    const patient = proj.rows.find(r => r.speaker === "2");
    expect(patient?.committedText).toBe("No.");
  });

  it("drops overlapping English LID hallucination when Arabic covers the same audio", () => {
    const state = reduceAll([
      frame(1, [
        tok("What was your name? Spikevax, Tetanus, and acellular.", {
          id: "h1",
          speakerId: "1",
          language: "en",
          startMs: 0,
          endMs: 2400,
        }),
      ]),
      frame(2, [
        tok(" اسمها بس", {
          id: "h2",
          speakerId: "1",
          language: "ar",
          startMs: 80,
          endMs: 2200,
        }),
      ]),
    ]);
    const text = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(text).not.toMatch(/Spikevax|Tetanus|acellular|What was your name/i);
    expect(text).toContain("اسمها");
    expect(state.activeUtterance?.language).toBe("ar");
  });

  it("keeps same-speaker language code-switch on one bubble", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello there.", { id: "l1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" عندي ألم شديد", { id: "l2", speakerId: "1", language: "ar", startMs: 100 }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(0);
    expect(state.pendingSpeakerFinals).toHaveLength(0);
    const text = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(text).toContain("Hello there.");
    expect(text).toContain("عندي");
  });

  it("keeps extended same-speaker bilingual speech in one bubble", () => {
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
    expect(state.finalizedUtterances).toHaveLength(0);
    const activeText = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(activeText).toContain("Hello there.");
    expect(activeText).toContain("عندي");
    expect(activeText).toContain("الأنف");
  });

  it("opens a new bubble when the same-language second speaker arrives on a mixed frame", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello doctor.", { id: "m1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok("Hello doctor.", { id: "m1", speakerId: "1", language: "en", startMs: 0 }),
        tok(" Yeah I know.", { id: "m2", speakerId: "2", language: "en", startMs: 200 }),
        tok(" right", { id: "m3", speakerId: "2", language: "en", startMs: 280, isFinal: false }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(state.finalizedUtterances[0]?.speaker).toBe("1");
    expect(state.activeUtterance?.speaker).toBe("2");
    const proj = projectTranscriptView(state, { chunkV2NativeTranslate: true });
    expect(proj.rows).toHaveLength(2);
    expect(proj.rows[0]?.speaker).toBe("1");
    expect(proj.rows[1]?.speaker).toBe("2");
    expect(proj.rows[1]?.committedText).toContain("Yeah");
    expect(proj.rows[1]?.liveText).toContain("right");
  });

  it("opens a new colored bubble on the first new-speaker final (live typing)", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello doctor.", { id: "s1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" wait", { id: "s2", speakerId: "2", language: "en", startMs: 100 }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(state.pendingSpeakerFinals).toHaveLength(0);
    expect(state.activeUtterance?.speaker).toBe("2");
    expect(state.activeUtterance && utteranceCommittedText(state.activeUtterance)).toContain("wait");
  });

  it("types live non-finals on the new speaker row immediately (no freeze dump)", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello doctor.", { id: "pb1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" I", { id: "pb2", speakerId: "2", language: "en", startMs: 100, isFinal: true }),
        tok(" have", { id: "pb3", speakerId: "2", language: "en", startMs: 150, isFinal: false }),
      ]),
    ]);
    expect(state.pendingSpeakerFinals).toHaveLength(0);
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(state.activeUtterance?.speaker).toBe("2");
    const proj = projectTranscriptView(state, { chunkV2NativeTranslate: true });
    const active = proj.rows.find(r => !r.finalized);
    expect(active?.speaker).toBe("2");
    expect(active?.committedText).toContain("I");
    expect(active?.liveText).toContain("have");
  });

  it("keeps same-speaker language live text typing on the open row", () => {
    const state = reduceAll([
      frame(1, [
        tok("Hello there.", { id: "pl1", speakerId: "1", language: "en", startMs: 0 }),
      ]),
      frame(2, [
        tok(" عندي ألم شديد", { id: "pl2", speakerId: "1", language: "ar", startMs: 100, isFinal: true }),
        tok(" في الأنف", { id: "pl3", speakerId: "1", language: "ar", startMs: 150, isFinal: false }),
      ]),
    ]);
    expect(state.pendingSpeakerFinals).toHaveLength(0);
    expect(state.finalizedUtterances).toHaveLength(0);
    const proj = projectTranscriptView(state, { chunkV2NativeTranslate: true });
    const active = proj.rows.find(r => !r.finalized);
    expect(active?.committedText).toContain("Hello there.");
    expect(active?.committedText).toMatch(/عندي/);
    expect(active?.liveText).toMatch(/الأنف/);
  });

  it("opens a new bubble immediately then continues same-speaker finals on it", () => {
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
    expect(state.finalizedUtterances).toHaveLength(1);
    expect(state.activeUtterance?.speaker).toBe("2");
    const activeText = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(activeText).toContain("I");
    expect(activeText).toContain("have pain");
    expect(activeText?.trimStart().startsWith("I")).toBe(true);
  });

  it("treats a brief speaker flip then return as handoffs (N=1 live)", () => {
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
    expect(state.finalizedUtterances.length).toBeGreaterThanOrEqual(2);
    expect(state.activeUtterance?.speaker).toBe("1");
    expect(state.activeUtterance && utteranceCommittedText(state.activeUtterance)).toContain("please");
  });

  it("keeps a same-speaker monologue in one bubble across sentence finals", () => {
    const state = reduceAll([
      frame(1, [
        tok("This is how much alcohol is toxic to the human body.", {
          id: "al1",
          speakerId: "1",
          language: "en",
          startMs: 0,
          endMs: 3000,
        }),
      ]),
      frame(2, [
        tok(" And this is how much alcohol the average person consumes every single week.", {
          id: "al2",
          speakerId: "1",
          language: "en",
          startMs: 3500,
          endMs: 7000,
        }),
      ]),
      frame(3, [
        tok(" And after this video, you are never going to want to drink alcohol again.", {
          id: "al3",
          speakerId: "1",
          language: "en",
          startMs: 7500,
          endMs: 11000,
        }),
      ]),
      frame(4, [
        tok(" Number 1: alcohol is a group 1 carcinogen.", {
          id: "al4",
          speakerId: "1",
          language: "en",
          startMs: 11500,
          endMs: 14000,
        }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(0);
    const text = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(text).toContain("toxic to the human body");
    expect(text).toContain("every single week");
    expect(text).toContain("never going to want");
    expect(text).toContain("Number 1");
  });

  it("keeps continuous same-speaker same-language speech in one bubble", () => {
    const state = reduceAll([
      frame(1, [
        tok("Barges killed Instagram. You can now connect Claude.", {
          id: "ig1",
          speakerId: "1",
          language: "en",
          startMs: 0,
          endMs: 2000,
        }),
      ]),
      frame(2, [
        tok(" It's called the Instagram agent skill.", {
          id: "ig2",
          speakerId: "1",
          language: "en",
          startMs: 2400,
          endMs: 4000,
        }),
      ]),
      frame(3, [
        tok(" One comments on other people's posts for you.", {
          id: "ig3",
          speakerId: "1",
          language: "en",
          startMs: 4300,
          endMs: 6000,
        }),
      ]),
    ]);
    expect(state.finalizedUtterances).toHaveLength(0);
    const text = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(text).toContain("Barges killed Instagram");
    expect(text).toContain("Instagram agent skill");
    expect(text).toContain("comments on other");
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

  it("keeps same-speaker language switch on one bubble (factura → Perfect)", () => {
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
    expect(proj.rows).toHaveLength(1);
    expect(proj.rows[0]?.committedText).toContain("Sí, la factura es correcta.");
    expect(proj.rows[0]?.committedText).toContain("Perfect");
    expect(proj.rows[0]?.committedText).toContain("503");
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

  it("pause-splits after ~5s wall quiet when audio also shows a real gap", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    state = reduceCanonAppendWs(
      state,
      frame(1, [
        tok("First block before a real pause.", {
          id: "w1",
          speakerId: "1",
          language: "en",
          startMs: 0,
          endMs: 2000,
        }),
      ]),
      { ledger, wallMs: 10_000, chunkV2NativeTranslate: true },
    );
    // 5.5s wall silence + 1.2s audio gap (real pause; not pure delivery delay).
    state = reduceCanonAppendWs(
      state,
      frame(2, [
        tok(" Second block after wall quiet.", {
          id: "w2",
          speakerId: "1",
          language: "en",
          startMs: 3200,
          endMs: 4800,
        }),
      ]),
      { ledger, wallMs: 15_500, chunkV2NativeTranslate: true },
    );
    expect(state.finalizedUtterances.length).toBeGreaterThanOrEqual(1);
    expect(utteranceCommittedText(state.finalizedUtterances[0]!)).toContain("First block");
    expect(state.activeUtterance && utteranceCommittedText(state.activeUtterance)).toContain(
      "Second block",
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

  it("keeps language switch after a finished word on the same bubble (Aug)", () => {
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
    expect(proj.rows).toHaveLength(1);
    expect(proj.rows[0]?.committedText).toContain("Hello.");
    expect(proj.rows[0]?.committedText).toContain("ألم");
  });

  it("does not open a new bubble on mid-word same-speaker language flicker", () => {
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
    // First frame has no trailing space/punct → mid-word absorb keeps one bubble when
    // language flickers, then returns to English.
    expect(state.finalizedUtterances).toHaveLength(0);
    const text = state.activeUtterance && utteranceCommittedText(state.activeUtterance);
    expect(text).toContain("Korea");
    expect(text).toContain("magic straight perm");
    expect(text).toContain("Korean person");
  });

  it("keeps sticky translation preview when a later frame has only original tokens", () => {
    let state = createInitialEngineState();
    const ledger = new AppendOnlyCanonLedger();
    state = reduceCanonAppendWs(
      state,
      frame(1, [
        tok("Hello world.", { id: "tx1", speakerId: "1", language: "en", startMs: 0 }),
        {
          id: "tr1",
          text: "مرحبا",
          isFinal: false,
          confidence: 1,
          translation_status: "translation",
        },
      ]),
      { ledger, wallMs: 1000, chunkV2NativeTranslate: true },
    );
    expect(state.activeTranslationPreviewText).toContain("مرحبا");
    state = reduceCanonAppendWs(
      state,
      frame(2, [
        tok(" More speech.", { id: "tx2", speakerId: "1", language: "en", startMs: 200 }),
      ]),
      { ledger, wallMs: 1100, chunkV2NativeTranslate: true },
    );
    // Original-only frame must not wipe the in-flight translation preview.
    expect(state.activeTranslationPreviewText).toContain("مرحبا");
    const frozen = freezeActiveUtterance(state);
    expect(frozen.finalizedUtterances[0]?.translationText).toContain("مرحبا");
  });
});
