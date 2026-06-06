import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyMorsyChunkV3EntityMask,
  restoreMorsyChunkV3EntityMask,
} from "./morsy-chunk-v3-entity-mask.js";
import {
  buildMorsyChunkV3FallbackPrompt,
  buildMorsyChunkV3SystemPrompt,
  normalizeDigits,
  validateChunkV3Input,
} from "./morsy-chunk-translation-v3.js";

describe("validateChunkV3Input", () => {
  it("skips empty and too-short chunks", () => {
    assert.equal(validateChunkV3Input(""), "");
    assert.equal(validateChunkV3Input("  "), "");
    assert.equal(validateChunkV3Input("ab"), "");
  });

  it("accepts valid chunks and trims whitespace", () => {
    assert.equal(validateChunkV3Input("Thank you"), "Thank you");
    assert.equal(validateChunkV3Input("  LDL cholesterol is 162 mg/dL.  "), "LDL cholesterol is 162 mg/dL.");
  });
});

describe("buildMorsyChunkV3SystemPrompt", () => {
  const prompt = buildMorsyChunkV3SystemPrompt("English", "Arabic");

  it("includes NUM_* copy instructions", () => {
    assert.match(prompt, /NUM_1, NUM_2/);
    assert.match(prompt, /copy each token exactly in place/i);
    assert.match(prompt, /Never modify, infer, round, estimate, reorder, or omit/i);
  });

  it("includes tense preservation", () => {
    assert.match(prompt, /Preserve grammatical tense exactly/i);
    assert.match(prompt, /past stays past/i);
    assert.match(prompt, /"I reviewed" must stay past tense/i);
  });

  it("rewrites fluency rule so it cannot alter clinical facts", () => {
    assert.match(prompt, /Fluency must NOT change tense/i);
    assert.match(prompt, /lab values, blood pressure readings, or entity identity/i);
  });
});

describe("buildMorsyChunkV3FallbackPrompt", () => {
  it("includes NUM_* and tense on fallback", () => {
    const prompt = buildMorsyChunkV3FallbackPrompt("English", "Arabic");
    assert.match(prompt, /NUM_1, NUM_2/);
    assert.match(prompt, /Preserve tense exactly/i);
  });
});

describe("applyMorsyChunkV3EntityMask — atomic spans", () => {
  function roundTrip(input: string): string {
    const mask = applyMorsyChunkV3EntityMask(input);
    return restoreMorsyChunkV3EntityMask(mask.masked, mask.slotToLiteral);
  }

  it("masks June 4, 2026 as one atomic span", () => {
    const input = "I reviewed your blood work from June 4, 2026.";
    const mask = applyMorsyChunkV3EntityMask(input);
    assert.equal(mask.masked, "I reviewed your blood work from NUM_1.");
    assert.equal(mask.slotToLiteral.get(1), "June 4, 2026");
    assert.equal(roundTrip(input), input);
  });

  it("masks blood pressure 152/94 as one atomic span", () => {
    const input = "Blood pressure is 152/94 mmHg.";
    const mask = applyMorsyChunkV3EntityMask(input);
    assert.equal(mask.masked, "Blood pressure is NUM_1.");
    assert.equal(mask.slotToLiteral.get(1), "152/94 mmHg");
    assert.equal(roundTrip(input), input);
  });

  it("masks 152/94 without unit as one atomic span", () => {
    const input = "BP 152/94 today.";
    const mask = applyMorsyChunkV3EntityMask(input);
    assert.equal(mask.masked, "BP NUM_1 today.");
    assert.equal(mask.slotToLiteral.get(1), "152/94");
    assert.equal(roundTrip(input), input);
  });

  it("masks 214 mg/dL as one atomic span", () => {
    const input = "LDL cholesterol is 214 mg/dL.";
    const mask = applyMorsyChunkV3EntityMask(input);
    assert.equal(mask.masked, "LDL cholesterol is NUM_1.");
    assert.equal(mask.slotToLiteral.get(1), "214 mg/dL");
    assert.equal(roundTrip(input), input);
  });

  it("masks 98.6 kg and 1000 mg and 40 mg as atomic spans", () => {
    const cases = [
      { input: "Weight is 98.6 kg.", literal: "98.6 kg", masked: "Weight is NUM_1." },
      { input: "Take 1000 mg daily.", literal: "1000 mg", masked: "Take NUM_1 daily." },
      { input: "Dose 40 mg.", literal: "40 mg", masked: "Dose NUM_1." },
    ];
    for (const c of cases) {
      const mask = applyMorsyChunkV3EntityMask(c.input);
      assert.equal(mask.masked, c.masked, c.input);
      assert.equal(mask.slotToLiteral.get(1), c.literal);
      assert.equal(roundTrip(c.input), c.input);
    }
  });

  it("masks HbA1c 8.9% with percentage as atomic span", () => {
    const input = "HbA1c is 8.9%.";
    const mask = applyMorsyChunkV3EntityMask(input);
    assert.equal(mask.masked, "HbA1c is NUM_1.");
    assert.equal(mask.slotToLiteral.get(1), "8.9%");
    assert.equal(roundTrip(input), input);
  });

  it("leaves I reviewed your blood work without NUM tokens when no entities", () => {
    const input = "I reviewed your blood work.";
    const mask = applyMorsyChunkV3EntityMask(input);
    assert.equal(mask.masked, input);
    assert.equal(mask.slotToLiteral.size, 0);
  });

  it("assigns separate NUM slots for multiple entities in one sentence", () => {
    const input = "On June 4, 2026 LDL was 214 mg/dL and BP 152/94.";
    const mask = applyMorsyChunkV3EntityMask(input);
    assert.equal(
      mask.masked,
      "On NUM_1 LDL was NUM_2 and BP NUM_3.",
    );
    assert.equal(mask.slotToLiteral.get(1), "June 4, 2026");
    assert.equal(mask.slotToLiteral.get(2), "214 mg/dL");
    assert.equal(mask.slotToLiteral.get(3), "152/94");
    assert.equal(roundTrip(input), input);
  });
});

describe("normalizeDigits", () => {
  it("converts Arabic-Indic and Persian digits to Western", () => {
    assert.equal(normalizeDigits("١٢٣"), "123");
    assert.equal(normalizeDigits("۱۲۳"), "123");
  });

  it("converts Devanagari and fullwidth digits", () => {
    assert.equal(normalizeDigits("१६२"), "162");
    assert.equal(normalizeDigits("１６２"), "162");
  });

  it("leaves Western digits and letters unchanged", () => {
    assert.equal(normalizeDigits("LDL 162 mg/dL"), "LDL 162 mg/dL");
    assert.equal(normalizeDigits("ضغط الدم 120/80"), "ضغط الدم 120/80");
  });
});
