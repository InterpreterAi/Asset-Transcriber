import { describe, expect, it } from "vitest";
import type { Token } from "@soniox/speech-to-text-web";
import { attachNonFinalRows, rowsFromSonioxTokens, snapshotLinesFromSonioxXRows, ROW_STRIPE_COLOR_CLASSES, stripeClassesForRows, stripeSlotKey } from "./rows-from-tokens";

function tok(partial: Partial<Token> & Pick<Token, "text"> & { source_language?: string }): Token {
  return {
    confidence: 1,
    is_final: true,
    ...partial,
  };
}

describe("rowsFromSonioxTokens", () => {
  it("pairs original and translation tokens on one row", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello ", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "world", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "مرحبا ", speaker: "1", language: "ar", translation_status: "translation" }),
      tok({ text: "بالعالم", speaker: "1", language: "ar", translation_status: "translation" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origFinal).toBe("Hello world");
    expect(rows[0]?.transFinal).toBe("مرحبا بالعالم");
  });

  it("concatenates Soniox pieces without inserting spaces", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "flav", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "ored", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " mold", speaker: "1", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origFinal).toBe("flavored mold");
  });

  it("keeps the same speaker on one bubble across <end> (spelling and phone numbers must not chop)", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Sure. It's 215 4.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "أكيد. هو 215 4.", speaker: "1", language: "ar", translation_status: "translation" }),
      tok({ text: "<end>", speaker: "1" }),
      tok({ text: " 31.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " 31.", speaker: "1", language: "ar", translation_status: "translation" }),
      tok({ text: "<end>", speaker: "1" }),
      tok({ text: " 5307.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " 5307.", speaker: "1", language: "ar", translation_status: "translation" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origFinal).toBe("Sure. It's 215 4. 31. 5307.");
    expect(rows[0]?.transFinal).toBe("أكيد. هو 215 4. 31. 5307.");
  });

  it("opens a new bubble after a 10s same-speaker pause, not a short pause", () => {
    const shortPause = rowsFromSonioxTokens([
      tok({
        text: "First clip",
        speaker: "1",
        language: "en",
        translation_status: "original",
        start_ms: 0,
        end_ms: 800,
      }),
      tok({
        text: "Still same",
        speaker: "1",
        language: "en",
        translation_status: "original",
        start_ms: 6200,
        end_ms: 7000,
      }),
    ]);
    expect(shortPause).toHaveLength(1);
    expect(shortPause[0]?.origFinal).toBe("First clipStill same");

    const longPause = rowsFromSonioxTokens([
      tok({
        text: "First clip",
        speaker: "1",
        language: "en",
        translation_status: "original",
        start_ms: 0,
        end_ms: 800,
      }),
      tok({
        text: "Next clip",
        speaker: "1",
        language: "en",
        translation_status: "original",
        start_ms: 11200,
        end_ms: 12000,
      }),
    ]);
    expect(longPause).toHaveLength(2);
    expect(longPause[0]?.origFinal).toBe("First clip");
    expect(longPause[1]?.origFinal).toBe("Next clip");
  });

  it("opens a new bubble when the same speaker id switches from Arabic to English", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "لازم زوجي لسه هنا. ", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "My husband still has to be here. ", speaker: "1", language: "en", translation_status: "translation" }),
      tok({ text: "So can you send it to us?", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "فهل يمكنكِ إرسالها لنا؟", speaker: "1", language: "ar", translation_status: "translation" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ origFinal: "لازم زوجي لسه هنا. ", origLang: "ar", transFinal: "My husband still has to be here. " });
    expect(rows[1]).toMatchObject({ origFinal: "So can you send it to us?", origLang: "en", transFinal: "فهل يمكنكِ إرسالها لنا؟" });
  });

  it("splits an English turn and an Arabic reply that share one speaker id (phone call case)", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Uh, possibly 10.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " Ten what?", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "آه، ربما 10. عشرة ماذا؟", speaker: "1", language: "ar", translation_status: "translation" }),
      tok({ text: " آلاف عطتني.", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "She gave me thousands.", speaker: "1", language: "en", translation_status: "translation" }),
      tok({ text: " Okay.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " حسنًا.", speaker: "1", language: "ar", translation_status: "translation" }),
    ]);
    expect(rows.map((r) => [r.origLang, r.origFinal, r.transFinal])).toEqual([
      ["en", "Uh, possibly 10. Ten what?", "آه، ربما 10. عشرة ماذا؟"],
      ["ar", " آلاف عطتني.", "She gave me thousands."],
      ["en", " Okay.", " حسنًا."],
    ]);
  });

  it("puts a late translation on its own original, not on the newer row", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "What bills were you given?", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " آه، عطتنيها 100.", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "أي أوراق نقدية أُعطيتِ؟", speaker: "1", language: "ar", translation_status: "translation" }),
      tok({ text: "Oh, she gave it to me in 100s.", speaker: "1", language: "en", translation_status: "translation" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ origLang: "en", transFinal: "أي أوراق نقدية أُعطيتِ؟" });
    expect(rows[1]).toMatchObject({ origLang: "ar", transFinal: "Oh, she gave it to me in 100s." });
  });

  it("keeps a digit row's translation on that row, not the previous sentence", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "لا.", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "No.", speaker: "1", language: "en", translation_status: "translation", source_language: "ar" }),
      tok({ text: "28.", speaker: "2", language: "en", translation_status: "original" }),
      tok({ text: "28.", speaker: "2", language: "ar", translation_status: "translation", source_language: "en" }),
    ]);
    expect(rows.map((r) => [r.origFinal, r.transFinal])).toEqual([
      ["لا.", "No."],
      ["28.", "28."],
    ]);
  });

  it("does not split a word when language id flips on the last letter", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "البن", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "ك", speaker: "2", language: "en", translation_status: "original" }),
      tok({ text: " the bank", speaker: "1", language: "en", translation_status: "translation", source_language: "ar" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origFinal).toBe("البنك");
    expect(rows[0]?.transFinal).toBe(" the bank");
  });

  it("does not switch language on digits or punctuation alone", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "عطتني", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: " 100", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "،", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " 100.", speaker: "1", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origFinal).toBe("عطتني 100، 100.");
  });

  it("gives Okay between Arabic turns its own bubble, each with its own translation", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "أنا هترجم كل حاجة. ", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "I will translate everything. ", speaker: "1", language: "en", translation_status: "translation" }),
      tok({ text: "<end>", speaker: "1" }),
      tok({ text: "Okay.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "حسنًا.", speaker: "1", language: "ar", translation_status: "translation" }),
      tok({ text: "<end>", speaker: "1" }),
      tok({ text: "بس أنتم اتكلموا عادي.", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "But you guys speak normally.", speaker: "1", language: "en", translation_status: "translation" }),
    ]);
    expect(rows.map((r) => [r.origFinal, r.transFinal])).toEqual([
      ["أنا هترجم كل حاجة. ", "I will translate everything. "],
      ["Okay.", "حسنًا."],
      ["بس أنتم اتكلموا عادي.", "But you guys speak normally."],
    ]);
  });

  it("collapses a mis-diarized short Okay onto the surrounding speaker id", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "أنا هترجم كل حاجة. ", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "Okay.", speaker: "2", language: "en", translation_status: "original" }),
      tok({ text: " بس أنتم اتكلموا عادي.", speaker: "1", language: "ar", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.speaker)).toEqual(["1", "1", "1"]);
    expect(rows[1]?.origFinal).toBe("Okay.");
  });

  it("opens a bubble for an English word inside Arabic too (every language change)", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "ابعتيلي على ", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "WhatsApp", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " دلوقتي.", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "Send it to me on WhatsApp now.", speaker: "1", language: "en", translation_status: "translation" }),
    ]);
    expect(rows.map((r) => r.origFinal)).toEqual(["ابعتيلي على ", "WhatsApp", " دلوقتي."]);
    expect(rows[2]?.transFinal).toBe("Send it to me on WhatsApp now.");
  });

  it("applies the same language split to every pair (EN↔ES)", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Mándamelo por ", speaker: "1", language: "es", translation_status: "original" }),
      tok({ text: "Send it to me by ", speaker: "1", language: "en", translation_status: "translation" }),
      tok({ text: "I need the email now.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "Necesito el correo ahora.", speaker: "1", language: "es", translation_status: "translation" }),
    ]);
    expect(rows.map((r) => [r.origLang, r.transFinal])).toEqual([
      ["es", "Send it to me by "],
      ["en", "Necesito el correo ahora."],
    ]);
  });

  it("does not rewind later speech onto an older bubble after a speaker change", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "I forgot how to write code.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "نسيت", speaker: "1", language: "ar", translation_status: "translation" }),
      tok({ text: "Hear me out. Claude for coding.", speaker: "2", language: "en", translation_status: "original" }),
      tok({ text: "اسمعني", speaker: "2", language: "ar", translation_status: "translation" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.origFinal).toBe("I forgot how to write code.");
    expect(rows[0]?.transFinal).toBe("نسيت");
    expect(rows[1]?.origFinal).toBe("Hear me out. Claude for coding.");
    expect(rows[1]?.transFinal).toBe("اسمعني");
  });

  it("opens a new row when a new speaker talks (same language)", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hi", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "Bye", speaker: "2", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.origFinal).toBe("Hi");
    expect(rows[1]?.origFinal).toBe("Bye");
  });

  it("opens a new row when a new speaker talks (different language)", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hi", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "أهلا", speaker: "1", language: "ar", translation_status: "translation" }),
      tok({ text: "مرحبا", speaker: "2", language: "ar", translation_status: "original" }),
      tok({ text: "Hello", speaker: "2", language: "en", translation_status: "translation" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.origFinal).toBe("Hi");
    expect(rows[1]?.origFinal).toBe("مرحبا");
  });

  it("opens a new row when speaker 1 talks again after speaker 2", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello there. ", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "Hi everyone. ", speaker: "2", language: "en", translation_status: "original" }),
      tok({ text: "Back to me now.", speaker: "1", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.origFinal)).toEqual([
      "Hello there. ",
      "Hi everyone. ",
      "Back to me now.",
    ]);
  });

  it("moves unlabeled lead-in words onto the next speaker instead of the previous bubble", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello from one.", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "Hi", language: "en", translation_status: "original" }),
      tok({ text: " there from two.", speaker: "2", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.origFinal).toBe("Hello from one.");
    expect(rows[1]?.origFinal).toBe("Hi there from two.");
    expect(rows[1]?.speaker).toBe("2");
  });

  it("opens a new row for a short real speaker turn, not only long ones", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello there friend. ", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "Hi.", speaker: "2", language: "en", translation_status: "original" }),
      tok({ text: " Welcome back.", speaker: "1", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.origFinal)).toEqual([
      "Hello there friend. ",
      "Hi.",
      " Welcome back.",
    ]);
  });

  it("does not open a bubble for a 1-token speaker flicker between the same speaker", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello ", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "there ", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "x", speaker: "2", language: "en", translation_status: "original" }),
      tok({ text: " friend", speaker: "1", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origFinal).toBe("Hello there x friend");
  });

  it("still opens a bubble when a new speaker says more than one token", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello there friend. ", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "Hi", speaker: "2", language: "en", translation_status: "original" }),
      tok({ text: " everyone.", speaker: "2", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.origFinal).toBe("Hello there friend. ");
    expect(rows[1]?.origFinal).toBe("Hi everyone.");
  });

  it("does not open a new bubble when only the translation speaker id differs", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "مرحبا", speaker: "2", language: "ar", translation_status: "translation" }),
      tok({ text: " again", speaker: "1", language: "en", translation_status: "original" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.origFinal).toBe("Hello again");
    expect(rows[0]?.transFinal).toBe("مرحبا");
  });
});

describe("snapshotLinesFromSonioxXRows", () => {
  it("keeps original and translation lines aligned", () => {
    expect(
      snapshotLinesFromSonioxXRows([
        {
          id: "sx-1",
          origFinal: "Hello",
          origPartial: " there",
          transFinal: "مرحبا",
          transPartial: "",
        },
      ]),
    ).toEqual({
      transcriptLines: ["Hello there"],
      translationLines: ["مرحبا"],
    });
  });

  it("does not snapshot dialect sexual Arabic as eat", () => {
    expect(
      snapshotLinesFromSonioxXRows([
        {
          id: "sx-1",
          origFinal: "بس هي كانت عايزة تتناك.",
          origPartial: "",
          transFinal: "but she wanted to eat.",
          transPartial: "",
        },
      ]).translationLines,
    ).toEqual(["but she wanted to get fucked."]);
  });
});

describe("attachNonFinalRows", () => {
  it("keeps committed rows stable and paints the live tail on the last bubble", () => {
    const finalized = rowsFromSonioxTokens([
      tok({ text: "Hello ", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "مرحبا ", speaker: "1", language: "ar", translation_status: "translation" }),
    ]);
    const live = attachNonFinalRows(finalized, [
      tok({ text: "world", speaker: "1", language: "en", translation_status: "original", is_final: false }),
    ]);
    expect(live).toHaveLength(1);
    expect(live[0]?.origFinal).toBe("Hello ");
    expect(live[0]?.origPartial).toBe("world");
    expect(live[0]).not.toBe(finalized[0]);
  });

  it("opens a live bubble when the live words are in the other language", () => {
    const finalized = rowsFromSonioxTokens([
      tok({ text: "How much was there?", speaker: "1", language: "en", translation_status: "original" }),
    ]);
    const live = attachNonFinalRows(finalized, [
      tok({ text: "عشرة آلاف", speaker: "1", language: "ar", translation_status: "original", is_final: false }),
    ]);
    expect(live).toHaveLength(2);
    expect(live[1]?.origPartial).toBe("عشرة آلاف");
  });

  it("paints a live translation on its own final original, then continues the live row", () => {
    const finalized = rowsFromSonioxTokens([
      tok({ text: "How much?", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: " عشرة", speaker: "1", language: "ar", translation_status: "original" }),
    ]);
    const live = attachNonFinalRows(finalized, [
      tok({ text: "كم؟", speaker: "1", language: "ar", translation_status: "translation", is_final: false }),
      tok({ text: " آلاف", speaker: "1", language: "ar", translation_status: "original", is_final: false }),
    ]);
    expect(live).toHaveLength(2);
    expect(live[0]).toMatchObject({ origFinal: "How much?", transPartial: "كم؟" });
    expect(live[1]).toMatchObject({ origFinal: " عشرة", origPartial: " آلاف" });
  });
});

describe("stripeClassesForRows", () => {
  it("keeps the same stripe when the same speaker code-switches language", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "Hola", speaker: "1", language: "es", translation_status: "translation" }),
      tok({ text: "<end>", speaker: "1" }),
      tok({ text: "Buenos días", speaker: "1", language: "es", translation_status: "original" }),
      tok({ text: "Good morning", speaker: "1", language: "en", translation_status: "translation" }),
    ]);
    expect(rows.map((r) => r.origLang)).toEqual(["en", "es"]);
    const stripes = stripeClassesForRows(rows);
    expect(stripes[0]).toBe(stripes[1]);
    expect(stripeSlotKey("1", "en")).toBe("1");
    expect(stripeSlotKey("1", "es")).toBe("1");
  });

  it("keeps the same stripe for the same speaker across long-pause rows", () => {
    const rows = rowsFromSonioxTokens([
      tok({
        text: "One",
        speaker: "1",
        language: "en",
        translation_status: "original",
        start_ms: 0,
        end_ms: 800,
      }),
      tok({ text: "<end>", speaker: "1" }),
      tok({
        text: "Two",
        speaker: "1",
        language: "en",
        translation_status: "original",
        start_ms: 20_000,
        end_ms: 21_000,
      }),
    ]);
    expect(rows).toHaveLength(2);
    const stripes = stripeClassesForRows(rows);
    expect(stripes[0]).toBe(stripes[1]);
  });

  it("uses distinct slots for different speakers", () => {
    const rows = [
      {
        id: "a",
        speaker: "1",
        origLang: "en",
        origFinal: "Hello",
        origPartial: "",
        transFinal: "",
        transPartial: "",
      },
      {
        id: "b",
        speaker: "2",
        origLang: "ar",
        origFinal: "مرحبا",
        origPartial: "",
        transFinal: "",
        transPartial: "",
      },
    ];
    const stripes = stripeClassesForRows(rows);
    expect(stripes[0]).toBe(ROW_STRIPE_COLOR_CLASSES[0]);
    expect(stripes[1]).toBe(ROW_STRIPE_COLOR_CLASSES[1]);
  });
});
