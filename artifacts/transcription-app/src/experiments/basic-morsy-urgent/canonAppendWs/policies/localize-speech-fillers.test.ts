import { describe, expect, it } from "vitest";

import type { CanonToken } from "../types/canon-token";
import { joinCanonText } from "../types/canon-token";
import { localizeFillersInCanonTokens } from "./localize-speech-fillers";

function tok(text: string, language?: string): CanonToken {
  return { token_id: text, text, is_final: true, language };
}

describe("localizeFillersInCanonTokens", () => {
  it("writes okay / uh / m-hm in Arabic when the rest of the bubble is Arabic", () => {
    const out = localizeFillersInCanonTokens([
      tok("مرحبا. ", "ar"),
      tok("M-hm ", "en"),
      tok("Okay. ", "en"),
      tok("تمام، تعال.", "ar"),
    ]);
    expect(joinCanonText(out)).toBe("مرحبا. مم حسنًا. تمام، تعال.");
    expect(out.every((t) => !t.language || t.language === "ar")).toBe(true);
  });

  it("localizes a leading Uh when the same frame continues in Arabic", () => {
    const out = localizeFillersInCanonTokens([
      tok("Uh, ", "en"),
      tok("الساعة 1 اليوم", "ar"),
    ]);
    expect(joinCanonText(out)).toBe("آه, الساعة 1 اليوم");
    expect(out[0]?.language).toBe("ar");
  });

  it("uses an already-open Arabic row as the ambient language", () => {
    const out = localizeFillersInCanonTokens(
      [tok("Okay. ", "en"), tok("Okay.", "en")],
      { text: "يعني تواصلت مع عيادة", language: "ar" },
    );
    expect(joinCanonText(out)).toBe("حسنًا. حسنًا.");
  });

  it("leaves a real English sentence that starts with Okay alone", () => {
    const out = localizeFillersInCanonTokens([
      tok("Okay, ask him what brought him to the emergency department.", "en"),
    ]);
    expect(out[0]?.text).toContain("Okay, ask him");
    expect(out[0]?.language).toBe("en");
  });

  it("maps okay to Spanish vale inside Spanish speech", () => {
    const out = localizeFillersInCanonTokens([
      tok("Okay. ", "en"),
      tok("pregunta qué le trajo", "es"),
    ]);
    expect(joinCanonText(out)).toBe("vale. pregunta qué le trajo");
  });

  it("does not rewrite hospital or content English", () => {
    const out = localizeFillersInCanonTokens([
      tok("Hospital. ", "en"),
      tok("قسم الطوارئ", "ar"),
    ]);
    expect(out[0]?.text).toContain("Hospital");
  });
});
