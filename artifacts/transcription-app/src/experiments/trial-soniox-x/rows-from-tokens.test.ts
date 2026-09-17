import { describe, expect, it } from "vitest";
import type { Token } from "@soniox/speech-to-text-web";
import { rowsFromSonioxTokens, snapshotLinesFromSonioxXRows, ROW_STRIPE_COLOR_CLASSES, stripeClassesForRows, stripeSlotKey } from "./rows-from-tokens";

function tok(partial: Partial<Token> & Pick<Token, "text">): Token {
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

  it("opens a new row when the original language switches, instead of mixing EN and AR on one line", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "لازم زوجي لسه هنا. ", speaker: "1", language: "ar", translation_status: "original" }),
      tok({ text: "My husband still has to be here. ", speaker: "1", language: "en", translation_status: "translation" }),
      tok({ text: "So can you send it to us?", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "فهل يمكنكِ إرسالها لنا؟", speaker: "1", language: "ar", translation_status: "translation" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.origFinal).toBe("لازم زوجي لسه هنا. ");
    expect(rows[0]?.transFinal).toBe("My husband still has to be here. ");
    expect(rows[1]?.origFinal).toBe("So can you send it to us?");
    expect(rows[1]?.transFinal).toBe("فهل يمكنكِ إرسالها لنا؟");
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
});

describe("stripeClassesForRows", () => {
  it("rotates stripe color when the same speaker id changes spoken language (EN↔ES)", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "Hello", speaker: "1", language: "en", translation_status: "original" }),
      tok({ text: "Hola", speaker: "1", language: "es", translation_status: "translation" }),
      tok({ text: "<end>", speaker: "1" }),
      tok({ text: "Buenos días", speaker: "1", language: "es", translation_status: "original" }),
      tok({ text: "Good morning", speaker: "1", language: "en", translation_status: "translation" }),
    ]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.origLang).toBe("en");
    expect(rows[1]?.origLang).toBe("es");
    const stripes = stripeClassesForRows(rows);
    expect(stripes[0]).not.toBe(stripes[1]);
    expect(stripeSlotKey("1", "en")).toBe("1:en");
    expect(stripeSlotKey("1", "es")).toBe("1:es");
  });

  it("keeps the same stripe for the same speaker+language across rows", () => {
    const rows = rowsFromSonioxTokens([
      tok({ text: "One", speaker: "1", language: "en", translation_status: "original" }),
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
    const stripes = stripeClassesForRows(rows);
    expect(stripes[0]).toBe(stripes[1]);
  });

  it("uses distinct slots for EN↔AR language turns with the same speaker id", () => {
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
        speaker: "1",
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
