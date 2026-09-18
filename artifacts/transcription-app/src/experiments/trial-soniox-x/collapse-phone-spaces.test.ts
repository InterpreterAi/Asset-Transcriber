import { describe, expect, it } from "vitest";
import { collapsePhoneNumberSpaces, collapsePhoneParts } from "./collapse-phone-spaces";

describe("collapsePhoneNumberSpaces", () => {
  it("sticks NANP grouped digits together", () => {
    expect(collapsePhoneNumberSpaces("call 215 431 5307 please")).toBe(
      "call 2154315307 please",
    );
    expect(collapsePhoneNumberSpaces("my number is 602 555 9147")).toBe(
      "my number is 6025559147",
    );
  });

  it("sticks digit-by-digit dictation together", () => {
    expect(collapsePhoneNumberSpaces("it is 2 1 5 4 3 1 5 3 0 7")).toBe(
      "it is 2154315307",
    );
  });

  it("sticks a local 0-trunk number together", () => {
    expect(collapsePhoneNumberSpaces("رقم 050 123 4567")).toBe("رقم 0501234567");
  });

  it("sticks an international number and keeps the plus", () => {
    expect(collapsePhoneNumberSpaces("call +1 215 431 5307 now")).toBe(
      "call +12154315307 now",
    );
  });

  it("removes spaces around hyphens and parens but keeps those marks", () => {
    expect(collapsePhoneNumberSpaces("call (215) 431 5307")).toBe(
      "call (215)4315307",
    );
    expect(collapsePhoneNumberSpaces("call 215 - 431 - 5307")).toBe(
      "call 215-431-5307",
    );
  });

  it("does not convert spoken number words", () => {
    expect(collapsePhoneNumberSpaces("so one thing")).toBe("so one thing");
    expect(collapsePhoneNumberSpaces("I am twenty three years old")).toBe(
      "I am twenty three years old",
    );
  });

  it("does not join year lists", () => {
    expect(collapsePhoneNumberSpaces("in 2020 2021")).toBe("in 2020 2021");
    expect(collapsePhoneNumberSpaces("in 2020, 2021")).toBe("in 2020, 2021");
  });

  it("does not join money or thousands", () => {
    expect(collapsePhoneNumberSpaces("it costs 1,234,567")).toBe("it costs 1,234,567");
    expect(collapsePhoneNumberSpaces("pay $215 431")).toBe("pay $215 431");
  });

  it("does not join short counts or room numbers", () => {
    expect(collapsePhoneNumberSpaces("I have 2 3 kids")).toBe("I have 2 3 kids");
    expect(collapsePhoneNumberSpaces("room 12 34")).toBe("room 12 34");
    expect(collapsePhoneNumberSpaces("scores 10 10 10 10")).toBe("scores 10 10 10 10");
  });

  it("does not strip a phone that already has no spaces", () => {
    expect(collapsePhoneNumberSpaces("call 215-431-5307 please")).toBe(
      "call 215-431-5307 please",
    );
  });

  it("leaves endpoint-chopped digits with periods alone", () => {
    expect(collapsePhoneNumberSpaces("Sure. It's 215 4. 31. 5307.")).toBe(
      "Sure. It's 215 4. 31. 5307.",
    );
  });

  it("is idempotent", () => {
    const once = collapsePhoneNumberSpaces("call 215 431 5307 please");
    expect(collapsePhoneNumberSpaces(once)).toBe(once);
  });

  it("collapses two phones in one sentence without joining them", () => {
    expect(collapsePhoneNumberSpaces("call 215 431 5307 or 602 555 9147")).toBe(
      "call 2154315307 or 6025559147",
    );
  });
});

describe("collapsePhoneParts", () => {
  it("keeps the final/partial split when the phone is already in one side", () => {
    expect(collapsePhoneParts("call 215 431 5307", " please")).toEqual({
      final: "call 2154315307",
      partial: " please",
    });
  });

  it("joins when the live split cuts a phone in half", () => {
    expect(collapsePhoneParts("call 215 431 ", "5307 please")).toEqual({
      final: "call 2154315307 please",
      partial: "",
    });
  });
});
