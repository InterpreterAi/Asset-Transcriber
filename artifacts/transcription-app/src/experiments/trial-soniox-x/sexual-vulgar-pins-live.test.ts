import { describe, expect, it } from "vitest";
import { displayPinPairs } from "./interpreter-glossary";
import { applyExactGlossaryPins } from "./pin-translation";
import { applyFaithfulMeaningFixes } from "./meaning-locks";

function run(o: string, t: string) {
  const pins = displayPinPairs("en", "ar", []);
  return applyFaithfulMeaningFixes(o, applyExactGlossaryPins(o, t, pins));
}

describe("repro user sexual pin failures", () => {
  it("pins short dialect زب to dick", () => {
    expect(run("زب", "Zip.")).toMatch(/dick/i);
  });

  it("pins خرا to shit (not fuck)", () => {
    const out = run("خرا. ما هذا الخرا؟", 'Fuck. What do you mean, "fuck"?');
    expect(out).toMatch(/shit/i);
    expect(out.toLowerCase()).not.toMatch(/what do you mean.*fuck/);
  });

  it("pins زب/زبي and ASR قصك in a mixed dialect line", () => {
    const out = run(
      "قصها. قصها. زب. زبدة. زب. دخل قصك.",
      "Cut it. Cut it. Zip. Butter. Zip. Put your cut in.",
    );
    expect(out).toMatch(/dick/i);
    expect(out).not.toMatch(/Zip/i);
  });

  it("forces fuck + pussy EN→فصحى (not أقضم)", () => {
    const out = run(
      "Yes, I would really like to fuck your pussy.",
      "نعم، أودّ حقًا أن أقضم كسّكِ.",
    );
    expect(out).toMatch(/نيك/);
    expect(out).not.toMatch(/أقضم/);
  });

  it("forces suck nipple + dick + pussy EN→فصحى", () => {
    const out = run(
      "Yep, I would really like to suck your nipples and put my dick inside of your pussy, baby.",
      "نعم، أودّ حقًا أن أمسك ثديَكِ وأحطّ قضيبي داخل كسّكِ يا حبيبتي.",
    );
    expect(out).toMatch(/امتص|مصّ/);
    expect(out).toMatch(/حلم/);
    expect(out).not.toMatch(/أمسك/);
    expect(out).toMatch(/قضيب|زبّ/);
    expect(out).not.toMatch(/أحط/);
  });

  it("does not let Soniox sanitize زبي/هيج/أنيك into upset/annoyed", () => {
    const out = run(
      "أيوه، أنا بس زبي وقف وهيج قوي عليكي، عايز أنيك جامد.",
      "Yeah, I'm just really upset and annoyed with you, I really need you to see me.",
    );
    expect(out).toMatch(/dick/i);
    expect(out).toMatch(/horny/i);
    expect(out).toMatch(/fuck/i);
    expect(out).not.toMatch(/upset/i);
    expect(out).not.toMatch(/annoyed/i);
    expect(out).not.toMatch(/see me/i);
  });
});
