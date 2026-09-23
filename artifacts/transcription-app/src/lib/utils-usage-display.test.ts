import { describe, expect, it } from "vitest";
import { displayMinutesUsedToday, formatMinutes } from "./utils";

describe("formatMinutes", () => {
  it("omits trailing 0m on whole hours", () => {
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(300)).toBe("5h");
    expect(formatMinutes(60)).toBe("1h");
  });

  it("rounds near-complete hours up instead of flooring to 59m", () => {
    expect(formatMinutes(119.6)).toBe("2h");
    expect(formatMinutes(299.6)).toBe("5h");
  });

  it("keeps mid-hour remainders", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(45)).toBe("45m");
  });
});

describe("displayMinutesUsedToday", () => {
  it("snaps to the daily cap when less than 1 minute remains", () => {
    expect(displayMinutesUsedToday(119.2, 120)).toBe(120);
    expect(displayMinutesUsedToday(299.1, 300)).toBe(300);
    expect(displayMinutesUsedToday(119, 120, 0.4)).toBe(120);
  });

  it("does not snap while a full displayed minute remains", () => {
    expect(displayMinutesUsedToday(118, 120)).toBe(118);
    expect(displayMinutesUsedToday(298, 300, 2)).toBe(298);
  });

  it("snaps when used meets or exceeds the cap", () => {
    expect(displayMinutesUsedToday(120, 120)).toBe(120);
    expect(displayMinutesUsedToday(305, 300)).toBe(300);
  });
});
