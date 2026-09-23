import { describe, expect, it } from "vitest";
import {
  cycleScriptReadingMode,
  detectReadingFamilyForText,
  pairSupportsScriptReading,
  readingButtonCopy,
  readingFamilyForPair,
  shouldShowScriptReading,
  textToLatinReading,
} from "./script-reading";

describe("script reading families", () => {
  it("picks the reading family from the language pair", () => {
    expect(readingFamilyForPair("ja", "en")).toBe("ja");
    expect(readingFamilyForPair("en", "zh-CN")).toBe("zh");
    expect(readingFamilyForPair("ko", "en")).toBe("ko");
    expect(readingFamilyForPair("th", "en")).toBe("th");
    expect(readingFamilyForPair("en", "es")).toBe(null);
    expect(pairSupportsScriptReading("ja", "en")).toBe(true);
    expect(pairSupportsScriptReading("en", "fr")).toBe(false);
  });

  it("detects script per cell with Japanese kana beating bare Han", () => {
    expect(detectReadingFamilyForText("こんにちは", "ja")).toBe("ja");
    expect(detectReadingFamilyForText("你好", "zh")).toBe("zh");
    expect(detectReadingFamilyForText("안녕하세요", "ko")).toBe("ko");
    expect(detectReadingFamilyForText("สวัสดี", "th")).toBe("th");
    expect(detectReadingFamilyForText("Hello", "ja")).toBe(null);
    expect(detectReadingFamilyForText("具合はどうですか", "ja")).toBe("ja");
  });

  it("cycles off → under → latin-only → off", () => {
    expect(cycleScriptReadingMode("off")).toBe("under");
    expect(cycleScriptReadingMode("under")).toBe("latin-only");
    expect(cycleScriptReadingMode("latin-only")).toBe("off");
  });

  it("labels the button for each family and mode", () => {
    expect(readingButtonCopy("ja", "off", false).label).toBe("Romaji");
    expect(readingButtonCopy("ja", "under", true).label).toBe("Romaji…");
    expect(readingButtonCopy("ja", "latin-only", false).label).toBe("Romaji only");
    expect(readingButtonCopy("zh", "under", false).label).toBe("Pinyin");
    expect(readingButtonCopy("ko", "latin-only", false).label).toBe("Romaja only");
    expect(readingButtonCopy("th", "off", false).label).toBe("Romanize");
  });

  it("shows readings in both columns only when the cell has that script", () => {
    expect(shouldShowScriptReading("こんにちは", "under", "ja")).toBe(true);
    expect(shouldShowScriptReading("Hello", "under", "ja")).toBe(false);
    expect(shouldShowScriptReading("こんにちは", "off", "ja")).toBe(false);
  });

  it("romanizes Chinese, Korean, and Thai without async dictionaries", () => {
    expect(textToLatinReading("你好", "zh").toLowerCase()).toContain("ni");
    expect(textToLatinReading("안녕하세요", "ko").toLowerCase()).toContain("annyeong");
    expect(textToLatinReading("สวัสดี", "th").toLowerCase()).toContain("sawat");
  });
});
