import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chunkV3NeedsFallback,
  maskChunkV3Preservations,
  restoreChunkV3Preservations,
  validateChunkV3Input,
} from "./morsy-chunk-translation-v3.js";

describe("validateChunkV3Input", () => {
  it("skips empty and too-short chunks", () => {
    assert.equal(validateChunkV3Input(""), "");
    assert.equal(validateChunkV3Input("  "), "");
    assert.equal(validateChunkV3Input("ab"), "");
  });

  it("accepts valid chunks", () => {
    assert.equal(validateChunkV3Input("Thank you"), "Thank you");
  });
});

describe("mask and restore", () => {
  it("preserves email unchanged through round-trip", () => {
    const input = "personal@outlook.com";
    const mask = maskChunkV3Preservations(input);
    assert.match(mask.maskedText, /__EMAIL_0__/);
    const restored = restoreChunkV3Preservations(mask.maskedText, mask);
    assert.equal(restored, input);
  });

  it("preserves numbers and units in order for 214 mg/dL", () => {
    const input = "214 mg/dL";
    const mask = maskChunkV3Preservations(input);
    const restored = restoreChunkV3Preservations(mask.maskedText, mask);
    assert.equal(restored, input);
  });

  it("preserves Blood pressure 120/80 mmHg tokens", () => {
    const input = "Blood pressure is 120/80 mmHg";
    const mask = maskChunkV3Preservations(input);
    const restored = restoreChunkV3Preservations(mask.maskedText, mask);
    assert.equal(restored, input);
  });

  it("preserves Hemoglobin A1c 8.9%", () => {
    const input = "Hemoglobin A1c is 8.9%";
    const mask = maskChunkV3Preservations(input);
    const restored = restoreChunkV3Preservations(mask.maskedText, mask);
    assert.equal(restored, input);
  });

  it("preserves LDL cholesterol 162 mg/dL", () => {
    const input = "LDL cholesterol is 162 mg/dL";
    const mask = maskChunkV3Preservations(input);
    const restored = restoreChunkV3Preservations(mask.maskedText, mask);
    assert.equal(restored, input);
  });
});

describe("chunkV3NeedsFallback", () => {
  it("detects refusal phrases", () => {
    assert.equal(chunkV3NeedsFallback("Sorry, I cannot help you"), true);
    assert.equal(chunkV3NeedsFallback("no text provided"), true);
    assert.equal(chunkV3NeedsFallback("شكراً لك"), false);
  });
});
