import { describe, expect, it } from "vitest";

import {
  advanceCommittedSource,
  splitChunkV2Pending,
} from "./morsy-urgent-chunk-translation-v2";

const FULL =
  "congestive heart failure, coronary artery disease, hypertension, type 2 diabetes mellitus";

const STABLES = [
  "congestive",
  "congestive heart",
  "congestive heart failure,",
  "congestive heart failure, coronary",
  "congestive heart failure, coronary artery",
  "congestive heart failure, coronary artery disease,",
  "congestive heart failure, coronary artery disease, hypertension,",
  "congestive heart failure, coronary artery disease, hypertension, type",
  "congestive heart failure, coronary artery disease, hypertension, type 2",
  "congestive heart failure, coronary artery disease, hypertension, type 2 diabetes",
  FULL,
];

describe("splitChunkV2Pending", () => {
  it("preserves leading space in pendingRaw but not in apiText", () => {
    const { pendingRaw, apiText } = splitChunkV2Pending("congestive heart", "congestive");
    expect(pendingRaw).toBe(" heart");
    expect(apiText).toBe("heart");
  });
});

describe("advanceCommittedSource (span-based)", () => {
  it("advances through inter-word space when apiText is trimmed", () => {
    const stable = "congestive heart";
    const committed = "congestive";
    const { pendingRaw, apiText } = splitChunkV2Pending(stable, committed);
    expect(apiText).toBe("heart");
    const next = advanceCommittedSource(committed, stable, pendingRaw.length);
    expect(next).toBe("congestive heart");
    expect(stable.startsWith(next)).toBe(true);
  });

  it("does not produce orthographic shard pending after heart commit", () => {
    let committed = "congestive";
    const stable = "congestive heart";
    const { pendingRaw } = splitChunkV2Pending(stable, committed);
    committed = advanceCommittedSource(committed, stable, pendingRaw.length);
    expect(committed).toBe("congestive heart");
    const stableWithFailure = "congestive heart failure,";
    const next = splitChunkV2Pending(stableWithFailure, committed);
    expect(next.apiText).toBe("failure,");
    expect(next.pendingRaw).toBe(" failure,");
  });

  it("keeps committedSource as an exact prefix through full audit progression", () => {
    let committedSource = "";
    for (const stableText of STABLES) {
      const { pendingRaw, apiText } = splitChunkV2Pending(stableText, committedSource);
      if (!apiText.length) {
        expect(stableText).toBe(committedSource);
        continue;
      }
      expect(stableText.startsWith(committedSource)).toBe(true);
      expect(pendingRaw.trim()).toBe(apiText);
      committedSource = advanceCommittedSource(
        committedSource,
        stableText,
        pendingRaw.length,
      );
      expect(stableText.startsWith(committedSource)).toBe(true);
    }
    expect(committedSource).toBe(FULL);
  });

  it("never yields corrupted deltas like t failure or y artery", () => {
    let committedSource = "";
    for (const stableText of STABLES) {
      const { pendingRaw, apiText } = splitChunkV2Pending(stableText, committedSource);
      if (!apiText.length) continue;
      expect(apiText).not.toMatch(/^[tyes]\b/);
      expect(pendingRaw.trim()).toBe(apiText);
      committedSource = advanceCommittedSource(
        committedSource,
        stableText,
        pendingRaw.length,
      );
    }
  });
});
