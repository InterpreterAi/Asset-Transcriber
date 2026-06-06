import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeDigits, validateChunkV3Input } from "./morsy-chunk-translation-v3.js";

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
