import { describe, expect, it } from "vitest";
import {
  repairArabicInterpreterAddress,
  repairArabicSessionGender,
  repairArabicUngenderedPatient,
} from "./arabic-interpreter-address";

describe("repairArabicInterpreterAddress", () => {
  it("rewrites feminine interpreter address on translate-for-me", () => {
    const out = repairArabicInterpreterAddress(
      "سأعطي دواءً لمريضة؛ أحتاج فقط منكِ أن تترجمي لي.",
      "I'm going to be giving medication to a patient; I just need you to translate for me.",
    );
    expect(out).toContain("منك");
    expect(out).not.toContain("منكِ");
    expect(out).toContain("تترجم");
    expect(out).not.toMatch(/تترجمي/);
  });

  it("does not rewrite patient-directed pain questions", () => {
    const ar = "ما مستوى ألمكِ الآن؟";
    const out = repairArabicInterpreterAddress(
      ar,
      "what is your pain level right now?",
    );
    expect(out).toBe(ar);
  });

  it("rewrites let-her-know lines aimed at the interpreter", () => {
    const out = repairArabicInterpreterAddress(
      "إذا أمكنكِ أن تبلغيها أنني آسفة",
      "If you could let her know that I am very sorry",
    );
    expect(out).toContain("تبلغ");
    expect(out).not.toMatch(/تبلغي/);
  });
});

describe("repairArabicUngenderedPatient", () => {
  it("rewrites مريضة to مريض when English has ungendered patient", () => {
    const out = repairArabicUngenderedPatient(
      "سأعطي دواءً لمريضة؛ أحتاج فقط منك أن تترجم لي.",
      "I'm going to be giving medication to a patient; I just need you to translate for me.",
    );
    expect(out).toContain("لمريض");
    expect(out).not.toContain("مريضة");
  });

  it("keeps مريضة when English marks female patient", () => {
    const ar = "سأعطي دواءً لمريضة.";
    expect(
      repairArabicUngenderedPatient(ar, "I'm giving medication to my female patient."),
    ).toBe(ar);
    expect(
      repairArabicUngenderedPatient(ar, "She is my patient and needs medication."),
    ).toBe(ar);
  });
});

describe("repairArabicSessionGender", () => {
  it("fixes both interpreter address and ungendered patient in one pass", () => {
    const out = repairArabicSessionGender(
      "سأعطي دواءً لمريضة؛ أحتاج فقط منكِ أن تترجمي لي.",
      "I'm going to be giving medication to a patient; I just need you to translate for me.",
    );
    expect(out).toBe("سأعطي دواءً لمريض؛ أحتاج فقط منك أن تترجم لي.");
  });
});
