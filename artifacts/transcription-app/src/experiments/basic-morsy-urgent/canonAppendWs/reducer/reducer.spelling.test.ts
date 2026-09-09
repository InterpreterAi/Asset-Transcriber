/**
 * Spelling/email hold was a later (non-4feb41b4) behavior removed on the restored path.
 * Confirmed short answers and speaker labels are no longer held/smoothed away.
 */
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

describe("restored reducer: no spelling/email hold", () => {
  it("keeps short confirmed scraps and does not invent hold-merge behavior", () => {
    const ledger = new AppendOnlyCanonLedger();
    let state = createInitialEngineState();
    const ctx = { ledger, wallMs: 1_000, chunkV2NativeTranslate: true };

    state = reduceCanonAppendWs(
      state,
      frame(1, [token("S.", { startMs: 10, speakerId: "1", language: "en" })], 1_000),
      ctx,
    );
    expect(utteranceCommittedText(state.activeUtterance!).trim()).toBe("S.");
    expect(state.finalizedUtterances).toHaveLength(0);
  });
});
