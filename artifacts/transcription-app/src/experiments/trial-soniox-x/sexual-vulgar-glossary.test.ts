import { describe, expect, it } from "vitest";
import {
  DIALECT_AR_TO_EN,
  EN_TO_MSA,
  sexualVulgarPinPairs,
} from "./sexual-vulgar-glossary";
import { applyFaithfulMeaningFixes, meaningLockPinPairs } from "./meaning-locks";

describe("sexual / vulgar EN↔فصحى glossary", () => {
  it("maps core English vulgar terms to فصحى (not dialect Egyptian)", () => {
    const byEn = Object.fromEntries(EN_TO_MSA.map((r) => [r.en.toLowerCase(), r.ar]));
    expect(byEn.fuck).toBe("نيك");
    expect(byEn.shit).toBe("خراء");
    expect(byEn.rape).toBe("اغتصاب");
    expect(byEn["sexual assault"]).toBe("اعتداء جنسي");
    expect(byEn["get fucked"]).toBe("أن يُناك");
    // Never dialect particles in the MSA targets
    for (const { ar } of EN_TO_MSA) {
      expect(ar).not.toMatch(/إيه|كده|عايز|بتتناك|هينيك/);
    }
  });

  it("maps dialect sexual Arabic to accurate English (never food)", () => {
    expect(DIALECT_AR_TO_EN.some((r) => r.ar === "تتناك" && /fuck/i.test(r.en))).toBe(true);
    expect(DIALECT_AR_TO_EN.every((r) => !/\beat\b/i.test(r.en))).toBe(true);
  });

  it("pins EN↔فصحى both ways on Arabic pairs, dialect only → English", () => {
    const pins = sexualVulgarPinPairs("en", "ar");
    expect(pins.some((p) => p.source === "fuck" && p.target === "نيك")).toBe(true);
    expect(pins.some((p) => p.source === "نيك" && p.target === "fuck")).toBe(true);
    expect(pins.some((p) => p.source === "تتناك" && /fuck/i.test(p.target))).toBe(true);
    // Never teach English speakers to output dialect sexually
    expect(pins.some((p) => p.source === "fuck" && p.target === "تتناك")).toBe(false);
    expect(pins.some((p) => p.source === "get fucked" && p.target === "تتناك")).toBe(false);
  });

  it("exposes the same pin list through meaningLockPinPairs", () => {
    expect(meaningLockPinPairs("en", "ar").some((p) => p.source === "fuck" && p.target === "نيك")).toBe(
      true,
    );
    expect(meaningLockPinPairs("en", "es").some((p) => p.source === "fuck" && p.target === "follar")).toBe(
      true,
    );
    expect(meaningLockPinPairs("en", "de")).not.toEqual([]);
  });

  it("still fixes تتناك → eat on live translation", () => {
    const out = applyFaithfulMeaningFixes(
      "بس هي كانت عايزة تتناك.",
      "but she wanted to eat.",
    );
    expect(out).toMatch(/get fucked/i);
    expect(out).not.toMatch(/\beat\b/i);
  });
});
