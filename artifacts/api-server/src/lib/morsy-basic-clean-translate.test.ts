import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMorsyBasicCleanFallbackPrompt,
  buildMorsyBasicCleanSystemPrompt,
  isMorsyCleanBadOutput,
} from "./morsy-basic-clean-translate.js";

describe("buildMorsyBasicCleanSystemPrompt", () => {
  const prompt = buildMorsyBasicCleanSystemPrompt("English", "Arabic", "ar");

  it("instructs partial live captions must still be translated", () => {
    assert.match(prompt, /partial words, cut-off sentences, and fragments are normal/i);
    assert.match(prompt, /Never refuse, apologize, warn/i);
    assert.match(prompt, /Never ask for more text/i);
  });
});

describe("buildMorsyBasicCleanFallbackPrompt", () => {
  it("rejects meta commentary in fallback", () => {
    const prompt = buildMorsyBasicCleanFallbackPrompt("English", "Arabic");
    assert.match(prompt, /Never mention errors or missing text/i);
  });
});

describe("isMorsyCleanBadOutput", () => {
  it("flags the Arabic complete-text error message", () => {
    const bad =
      "يبدو أن هناك خطأ في النص المقدم. يرجى تقديم نص كامل للترجمة.";
    assert.equal(isMorsyCleanBadOutput(bad, "It's about to happ"), true);
  });

  it("flags English provide-complete-text refusals", () => {
    assert.equal(
      isMorsyCleanBadOutput(
        "There seems to be an error in the provided text. Please provide a complete text for translation.",
        "It's about to happ",
      ),
      true,
    );
  });

  it("accepts a normal short translation", () => {
    assert.equal(isMorsyCleanBadOutput("إنه على وشك أن يحدث", "It's about to happ"), false);
  });

  it("treats empty output as bad", () => {
    assert.equal(isMorsyCleanBadOutput("", "hello"), true);
  });
});
