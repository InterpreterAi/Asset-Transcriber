import { describe, expect, it } from "vitest";
import {
  repairArabicBurpFartMistranslation,
  repairArabicSendMeImperativeEnglish,
} from "./arabic-phrase-repairs";
import { applyGlossaryPostProcess } from "./glossary-post-process";
import {
  inferEnglishAddresseeGender,
  repairArabicSessionGender,
} from "./arabic-interpreter-address";

describe("repairArabicBurpFartMistranslation", () => {
  it("rewrites vomit/pimples mistranslation for burp and fart", () => {
    const out = repairArabicBurpFartMistranslation(
      "أفضل شيء هو أن يمشي حول المكان بلطف وأن يشرب شيئًا فوّارًا لمساعدته على القيء والبثور لإخراج الغاز.",
      "have something bubbly to drink to help burp and fart to pass the gas",
    );
    expect(out).toContain("التجشؤ وإخراج الريح");
    expect(out).not.toContain("القيء");
    expect(out).not.toContain("البثور");
  });
});

describe("repairArabicSendMeImperativeEnglish", () => {
  it("rewrites You sent me → Send me for تبعتلي", () => {
    const out = repairArabicSendMeImperativeEnglish(
      "You sent me the address and the appointment. On WhatsApp.",
      "أنا تبعتلي الأدرس والموعد. على المسج.",
    );
    expect(out).toBe("Send me the address and the appointment. On WhatsApp.");
  });
});

describe("male patient gender + sticky", () => {
  it("masculinizes 2nd person when English marks him", () => {
    const out = repairArabicSessionGender(
      "هل يمكنكِ التحقق من تاريخ ميلادكِ من أجلي؟",
      "we have a test that we need to get scheduled for him",
    );
    expect(out).toContain("يمكنك");
    expect(out).not.toContain("يمكنكِ");
    expect(out).toContain("ميلادك");
    expect(out).not.toContain("ميلادكِ");
  });

  it("uses sticky male gender when the line has only you", () => {
    const out = repairArabicSessionGender(
      "هل تحتاجين إلى أي مساعدة في الوقوف؟",
      "Do you need any assistance standing?",
      { sessionAddresseeGender: "m" },
    );
    expect(out).toContain("تحتاج");
    expect(out).not.toContain("تحتاجين");
  });

  it("rewrites feminine interpreter title", () => {
    const out = repairArabicSessionGender(
      "شكرًا لك، أيتها المترجمة.",
      "Okay. Thank you, interpreter.",
    );
    expect(out).toContain("أيها المترجم");
    expect(out).not.toContain("أيتها المترجمة");
  });

  it("keeps feminine when English strongly marks she", () => {
    const ar = "هل يمكنكِ التحقق من تاريخ ميلادكِ؟";
    expect(
      repairArabicSessionGender(ar, "She needs to verify her date of birth."),
    ).toBe(ar);
  });

  it("does not treat let-her-know (doctor) as female patient sticky", () => {
    expect(
      inferEnglishAddresseeGender(
        "you will call Dr. Fitzpatrick to let her know. I'm going to write her phone number",
      ),
    ).toBeUndefined();
  });
});

describe("glossary wiring", () => {
  it("applies burp/fart and send-me through applyGlossaryPostProcess", () => {
    const burp = applyGlossaryPostProcess(
      "مساعدته على القيء والبثور لإخراج الغاز.",
      [],
      {
        originalText: "to help burp and fart to pass the gas",
        rowSourceLanguage: "en",
        langA: "en",
        langB: "ar",
      },
    );
    expect(burp).toContain("التجشؤ");
    expect(burp).not.toContain("القيء");

    const send = applyGlossaryPostProcess(
      "You sent me the address.",
      [],
      {
        originalText: "تبعتلي الأدرس.",
        rowSourceLanguage: "ar",
        langA: "en",
        langB: "ar",
      },
    );
    expect(send).toBe("Send me the address.");
  });
});
