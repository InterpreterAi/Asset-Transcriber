import { describe, expect, it } from "vitest";
import { repairSpokenOriginalAsr } from "./asr-original-repair";
import { displayPinPairs } from "./interpreter-glossary";
import { applyExactGlossaryPins } from "./pin-translation";
import { applyFaithfulMeaningFixes } from "./meaning-locks";

function run(o: string, t: string) {
  const orig = repairSpokenOriginalAsr(o);
  const pins = displayPinPairs("en", "ar", []);
  return {
    orig,
    trans: applyFaithfulMeaningFixes(orig, applyExactGlossaryPins(orig, t, pins)),
  };
}

describe("repairSpokenOriginalAsr", () => {
  it("restores هايج when Soniox wrote هاجي in sexual context", () => {
    const o = repairSpokenOriginalAsr(
      "أيوه، يا دكتور، أنا حاسة إن أنا هاجي هنا جدًا، وعايزة أتنك.",
    );
    expect(o).toContain("هايج");
    expect(o).not.toContain("هاجي");
    expect(o).toContain("أتنك");
  });

  it("restores هايج when the speaker repeats the mis-heard word", () => {
    const o = repairSpokenOriginalAsr(
      "حاسة إن أنا هاجي هنا، هاجي هنا، هاجي، هاجي، هاجي، هاجي، هاجي.",
    );
    expect(o).toContain("هايج");
    expect(o).not.toContain("هاجي");
  });

  it("does not rewrite plain travel هاجي without sexual cues", () => {
    const o = repairSpokenOriginalAsr("هارجع البيت وبعدين هاجي هنا بكرة.");
    expect(o).toContain("هاجي");
    expect(o).not.toContain("هايج");
  });

  it("fixes أتنى truncation to أتنك", () => {
    expect(repairSpokenOriginalAsr("عايزة أتنى.")).toContain("أتنك");
  });

  it("then translates restored هايج as horny, not come", () => {
    const { orig, trans } = run(
      "أيوه، يا دكتور، أنا حاسة إن أنا هاجي هنا جدًا، وعايزة أتنك.",
      "Yes, doctor, I feel like I'm going to come here a lot, and I want to get fucked.",
    );
    expect(orig).toMatch(/هايج/);
    expect(trans).toMatch(/horny/i);
    expect(trans).not.toMatch(/come here a lot/i);
  });
});
