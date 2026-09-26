import { describe, expect, it } from "vitest";
import { applyFaithfulMeaningFixes, meaningLockPinPairs } from "./meaning-locks";

describe("applyFaithfulMeaningFixes", () => {
  it("does not turn dialect sexual Arabic into eat", () => {
    const orig =
      "بس ما كانش هينفع إن إحنا نتكلم، ولا نلعب، بس هي كانت عايزة تتناك.";
    const trans =
      "But it wouldn't be possible for us to talk, or to play, but she wanted to eat.";
    const out = applyFaithfulMeaningFixes(orig, trans);
    expect(out).toMatch(/get fucked/i);
    expect(out).not.toMatch(/\beat\b/i);
    expect(out).toContain("talk");
    expect(out).toContain("play");
  });

  it("does not rewrite an original that said eat", () => {
    expect(applyFaithfulMeaningFixes("She wanted to eat.", "أرادت أن تأكل.")).toBe(
      "أرادت أن تأكل.",
    );
  });

  it("renders informal English into فصحى, not Egyptian", () => {
    const out = applyFaithfulMeaningFixes(
      "What the fuck do you mean, bro?",
      "إيه اللي تقصده يا أسطى؟",
    );
    expect(out).toMatch(/ماذا تقصد بحق الجحيم/);
    expect(out).toMatch(/يا رجل/);
    expect(out).not.toMatch(/إيه/);
    expect(out).not.toMatch(/أسطى/);
  });

  it("does not rewrite Arabic originals into فصحى", () => {
    const orig = "هل تسمعني جيدًا؟ نعم، أه طبعًا، أنا كنت بتكلم معها";
    const trans = "Can you hear me clearly? Yes, of course, I was talking to her";
    expect(applyFaithfulMeaningFixes(orig, trans)).toBe(trans);
  });

  it("rewrites a dialect Arabic translation of English into فصحى", () => {
    const out = applyFaithfulMeaningFixes(
      "Can you hear me clearly? I was talking to her today and that will not work.",
      "إيه، أنا كنت بتكلم معها النهارده ومش هينفع كده يا أسطى.",
    );
    expect(out).not.toMatch(/إيه/);
    expect(out).not.toMatch(/النهارده/);
    expect(out).not.toMatch(/مش هينفع/);
    expect(out).not.toMatch(/كده/);
    expect(out).not.toMatch(/أسطى/);
    expect(out).toMatch(/ماذا|ما الذي/);
    expect(out).toMatch(/اليوم/);
    expect(out).toMatch(/رجل/);
  });

  it("rewrites a dialect-to-dialect Arabic translation into فصحى without touching the original", () => {
    const orig = "أنا كنت بتكلم معها وهي قالت لي لا مش هينفع كده";
    const trans = "شو يعني ليش هيك ما بصير يا أسطى";
    const out = applyFaithfulMeaningFixes(orig, trans);
    expect(out).not.toMatch(/شو /);
    expect(out).not.toMatch(/ليش/);
    expect(out).not.toMatch(/هيك/);
    expect(out).not.toMatch(/أسطى/);
    expect(out).toMatch(/ماذا|لماذا|هكذا|رجل/);
    expect(orig).toContain("بتكلم");
    expect(orig).toContain("مش هينفع");
  });
});

describe("meaningLockPinPairs", () => {
  it("is one-way on Arabic pairs and empty otherwise", () => {
    const ar = meaningLockPinPairs("en", "ar");
    expect(ar.some((p) => p.source === "تتناك" && p.target.includes("fuck"))).toBe(true);
    expect(ar.some((p) => p.source.includes("fuck") && p.target === "تتناك")).toBe(false);
    expect(meaningLockPinPairs("en", "de")).toEqual([]);
  });
});
