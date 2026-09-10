import { describe, expect, it } from "vitest";

import { isChunkV2ShortAcknowledgement } from "./short-acknowledgement";

describe("isChunkV2ShortAcknowledgement", () => {
  it("matches common EN/AR backchannels", () => {
    for (const t of ["Okay.", "ok", "Huh?", "ها؟", "نعم", "Good.", "تمام", "yeah"]) {
      expect(isChunkV2ShortAcknowledgement(t), t).toBe(true);
    }
  });

  it("rejects real content", () => {
    for (const t of [
      "I have pain in my nose",
      "عندي ألم في الخشم",
      "How are you feeling today",
    ]) {
      expect(isChunkV2ShortAcknowledgement(t), t).toBe(false);
    }
  });
});
