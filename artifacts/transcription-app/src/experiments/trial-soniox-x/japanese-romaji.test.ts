import { describe, expect, it } from "vitest";
import { containsJapaneseScript, readingsToRomaji, shouldShowJapaneseReading } from "./japanese-romaji";

describe("japanese romaji reading", () => {
  it("turns kana readings into spaced romaji and keeps the option extra", () => {
    expect(containsJapaneseScript("具合はどうですか")).toBe(true);
    expect(containsJapaneseScript("How are you")).toBe(false);
    expect(shouldShowJapaneseReading("こんにちは", true)).toBe(true);
    expect(shouldShowJapaneseReading("こんにちは", false)).toBe(false);
    expect(shouldShowJapaneseReading("Hello", true)).toBe(false);
  });

  it("reads a Japanese sentence in Latin letters without dropping the words", () => {
    const romaji = readingsToRomaji([
      { surface: "具合", reading: "グアイ", pos: "名詞" },
      { surface: "は", reading: "ハ", pos: "助詞" },
      { surface: "どう", reading: "ドウ", pos: "副詞" },
      { surface: "です", reading: "デス", pos: "助動詞" },
      { surface: "か", reading: "カ", pos: "助詞" },
      { surface: "。", pos: "記号" },
    ]);
    expect(romaji).toBe("guai wa dou desu ka.");
  });

  it("keeps English and fixes the set greeting", () => {
    expect(
      readingsToRomaji([
        { surface: "こんにちは", reading: "コンニチハ", pos: "感動詞" },
        { surface: "MRI", pos: "名詞" },
      ]),
    ).toBe("konnichiwa MRI");
  });
});
