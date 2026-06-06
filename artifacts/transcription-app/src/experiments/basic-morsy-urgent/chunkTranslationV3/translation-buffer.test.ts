import { describe, expect, it } from "vitest";

import { TranslationBuffer } from "./translation-buffer";

describe("TranslationBuffer", () => {
  it("returns a sentence when a boundary is found", () => {
    const buffer = new TranslationBuffer();
    expect(buffer.addText("Hello world.")).toBe("Hello world.");
    expect(buffer.addText(" Next")).toBeNull();
  });

  it("forceFlush returns remaining text", () => {
    const buffer = new TranslationBuffer();
    buffer.addText("No boundary yet");
    expect(buffer.forceFlush()).toBe("No boundary yet");
    expect(buffer.forceFlush()).toBe("");
  });
});
