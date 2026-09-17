import { describe, expect, it } from "vitest";
import {
  collapsePhoneSeparators,
  formatTranscriptNumbers,
} from "./format-transcript-numbers";

describe("collapsePhoneSeparators", () => {
  it("sticks spaced phone digits together", () => {
    expect(collapsePhoneSeparators("call 215 431 5307 please")).toBe(
      "call 2154315307 please",
    );
  });

  it("removes commas inside phone digit runs", () => {
    expect(collapsePhoneSeparators("215,431,5307")).toBe("2154315307");
  });

  it("does not join year lists", () => {
    expect(collapsePhoneSeparators("in 2020, 2021")).toBe("in 2020, 2021");
  });

  it("leaves short digit groups alone", () => {
    expect(collapsePhoneSeparators("room 12 34")).toBe("room 12 34");
  });
});

describe("formatTranscriptNumbers", () => {
  it("writes English number words as digits", () => {
    expect(formatTranscriptNumbers("I am twenty three years old", "en")).toBe(
      "I am 23 years old",
    );
    expect(formatTranscriptNumbers("one hundred five", "en")).toBe("105");
  });

  it("writes Spanish number words as digits", () => {
    expect(formatTranscriptNumbers("tengo veintitrés años", "es")).toBe(
      "tengo 23 años",
    );
    expect(formatTranscriptNumbers("son treinta y cinco", "es")).toBe(
      "son 35",
    );
    expect(formatTranscriptNumbers("llegó a las once", "es")).toBe(
      "llegó a las 11",
    );
  });

  it("does not treat English once as a number", () => {
    expect(formatTranscriptNumbers("once upon a time", "en")).toBe(
      "once upon a time",
    );
  });

  it("does not turn oh / Oh interjections into 0", () => {
    expect(formatTranscriptNumbers("Oh, hello. Oh my God.", "en")).toBe(
      "Oh, hello. Oh my God.",
    );
    expect(formatTranscriptNumbers("oh, hello. oh my— oh my God.", "en")).toBe(
      "oh, hello. oh my— oh my God.",
    );
  });

  it("collapses phone numbers after digit conversion", () => {
    expect(
      formatTranscriptNumbers("my number is 602 555 9147", "en"),
    ).toBe("my number is 6025559147");
  });

  it("leaves non EN/ES scripts unchanged aside from phone digits", () => {
    expect(formatTranscriptNumbers("رقم 050 123 4567", "ar")).toBe(
      "رقم 0501234567",
    );
  });
});
