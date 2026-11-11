import { describe, expect, it } from "vitest";
import { correctNorthRouteHandoff, correctNorthRouteTranslation } from "./handoff-hearing";

describe("NorthRoute handoff", () => {
  it("rewrites the greeting and keeps the name that followed", () => {
    expect(
      correctNorthRouteHandoff(
        "Thank you for calling NorthRoute Arabic Interpreter. My name is Mohamed.",
      ),
    ).toBe("You're through to the Arabic Interpreter. My name is Mohamed.");
  });

  it("rewrites a NorthRoute line that has no thank-you prefix", () => {
    expect(correctNorthRouteHandoff("NorthRoute Arabic Interpreter.")).toBe(
      "you're through to the Arabic Interpreter.",
    );
  });

  it("leaves a real arrival line alone", () => {
    const line = "You're through to the Arabic interpreter.";
    expect(correctNorthRouteHandoff(line)).toBe(line);
  });

  it("fixes the Arabic thank-you that was translated from NorthRoute", () => {
    const original = "Thank you for calling NorthRoute Arabic Interpreter.";
    expect(
      correctNorthRouteTranslation(
        original,
        "شكراً لاتصالك بمترجم اللغة العربية في نورث روت.",
      ),
    ).toBe("تم تحويلك إلى مترجم اللغة العربية.");
  });

  it("does not rewrite a thank-you translation when the original never said NorthRoute", () => {
    const translation = "Hello, thank you for calling the Arabic interpreter. Is it possible?";
    expect(
      correctNorthRouteTranslation("مرحباً، شكراً على اتصالك بالمترجم العربي ممكن؟", translation),
    ).toBe(translation);
  });
});
