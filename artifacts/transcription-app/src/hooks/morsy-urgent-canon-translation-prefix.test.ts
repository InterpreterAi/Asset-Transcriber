import { describe, expect, it } from "vitest";

import {
  applyMorsyCanonLiveTranslationPaint,
  composeLockedLiveTranslation,
  liveTailAfterLockedPrefix,
  splitFullTranslationAtStableSource,
} from "./morsy-urgent-canon-translation-prefix";

describe("morsy-urgent-canon-translation-prefix", () => {
  it("splits cumulative translation at stable word ratio", () => {
    const stable = "Good morning, this is";
    const visible = "Good morning, this is Dr. Michael";
    const full = "Buenos días, esto es el Dr. Michael";
    const split = splitFullTranslationAtStableSource(stable, visible, full);
    expect(split.lockedPrefix.length).toBeGreaterThan(0);
    expect(split.liveTail.length).toBeGreaterThan(0);
    expect(composeLockedLiveTranslation(split.lockedPrefix, split.liveTail)).toBe(full);
  });

  it("extends lock when stable grows but keeps prefix on interim updates", () => {
    let state = { lockedStableSource: "", lockedTranslationPrefix: "" };
    const visible1 = "Good morning, this is Dr.";
    const full1 = "Buenos días, esto es el Dr.";
    const first = applyMorsyCanonLiveTranslationPaint(state, "Good morning,", visible1, full1);
    state = first.prefixState;
    expect(first.composed).toBe(full1);

    const visible2 = "Good morning, this is Dr. Michael";
    const full2 = "Buenos días, esto es el Dr. Michael";
    const second = applyMorsyCanonLiveTranslationPaint(
      state,
      "Good morning, this is",
      visible2,
      full2,
    );
    expect(second.locked.length).toBeGreaterThan(0);
    expect(second.composed).toBe(full2);

    const full3 = "Buenos días, esto es el Dr. Michael Thompson";
    const third = applyMorsyCanonLiveTranslationPaint(
      second.prefixState,
      "Good morning, this is",
      visible2,
      full3,
    );
    expect(third.locked).toBe(second.locked);
    expect(liveTailAfterLockedPrefix(third.locked, full3).length).toBeGreaterThan(0);
    expect(third.composed).toBe(full3);
  });
});
