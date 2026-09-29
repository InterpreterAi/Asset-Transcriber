import { describe, expect, it } from "vitest";
import { joinPhoneNumberSeparators as join } from "./phone-digits";

describe("joinPhoneNumberSeparators", () => {
  it("joins Soniox-formatted phone numbers into one digit run", () => {
    expect(join("My number is 555-123-4567.")).toBe("My number is 5551234567.");
    expect(join("Call 555.123.4567 today")).toBe("Call 5551234567 today");
    expect(join("It's 555 123 4567")).toBe("It's 5551234567");
    expect(join("It's 555  123  4567")).toBe("It's 5551234567");
    expect(join("It's 555 - 123 - 4567")).toBe("It's 5551234567");
    expect(join("Yes. Um, 5502-780-8140.")).toBe("Yes. Um, 55027808140.");
    expect(join("(555) 123-4567")).toBe("5551234567");
    expect(join("+1 555 123 4567")).toBe("+15551234567");
    expect(join("1-800-555-1234")).toBe("18005551234");
    expect(join("+44 20 7946 0958")).toBe("+442079460958");
    expect(join("local 555-1234 please")).toBe("local 5551234 please");
    expect(join("رقمي 555-123-4567 شكرا")).toBe("رقمي 5551234567 شكرا");
  });

  it("joins only the phone when another number follows after a space", () => {
    expect(join("call 555-123-4567 12 times")).toBe("call 5551234567 12 times");
  });

  it("never changes, adds, or reorders digits", () => {
    for (const s of ["555-123-4567", "5502-780-8140", "+1 555 123 4567", "(555) 123-4567"]) {
      const digitsIn = s.replace(/\D/g, "");
      expect(join(s).replace(/\D/g, "")).toBe(digitsIn);
    }
  });

  it("leaves non-phone numbers exactly as written", () => {
    const untouched = [
      "Temperature 98.6 today",
      "Take 1.5 mg twice",
      "BP 120/80",
      "It costs $1,200",
      "$555 123 4567",
      "Born 09-29-2026",
      "Date 2026-09-29",
      "Date 29.09.2026",
      "At 10:30 am",
      "Server 192.168.1.1",
      "ZIP 12345-6789",
      "Card 4111 1111 1111 1111",
      "Years 2024 2025 2026",
      "Scores 100 200 300 400",
      "Ages 10 12 and 14",
      "D736. Mm-hm. D736.",
      "Code D736 555 1234",
      "B 7 flavored mold. 100% natural flavor.",
      "Pi is 3.14159265",
      "Room 1204",
      "Claim CLM-2024-5551234",
      "It is 555 1234",
      "SSN 490530726.",
      "Okay-490530726.",
      "",
    ];
    for (const s of untouched) expect(join(s), s).toBe(s);
  });
});
