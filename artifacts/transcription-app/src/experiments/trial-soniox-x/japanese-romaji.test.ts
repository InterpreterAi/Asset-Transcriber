import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  containsJapaneseScript,
  inflateDictBytes,
  isGzipBuffer,
  kanaFallbackRomaji,
  readingsToRomaji,
  shouldShowJapaneseReading,
} from "./japanese-romaji";

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

  it("shows Latin letters for kana even before the dictionary loads", () => {
    expect(kanaFallbackRomaji("ありがとうございます。")).toBe("arigatougozaimasu.");
    expect(kanaFallbackRomaji("お元気ですか")).toBe("o desuka");
    expect(isGzipBuffer(new Uint8Array([0x1f, 0x8b, 0x08]))).toBe(true);
    expect(isGzipBuffer(new Uint8Array([0x00, 0x00]))).toBe(false);
  });

  it("does not import kuromoji's Node fs dictionary loader", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./japanese-romaji.ts", import.meta.url), "utf8"),
    );
    expect(src).not.toMatch(/NodeDictionaryLoader/);
    expect(src).not.toMatch(/from ["']fs["']/);
    expect(src).not.toMatch(/zlibjs/);
  });

  it("inflates gzip dict bytes and leaves already-plain bytes alone", async () => {
    const raw = new TextEncoder().encode("romaji-dict");
    const gz = gzipSync(raw);
    const inflated = new Uint8Array(await inflateDictBytes(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength)));
    expect(new TextDecoder().decode(inflated)).toBe("romaji-dict");
    const plain = await inflateDictBytes(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    expect(new TextDecoder().decode(new Uint8Array(plain))).toBe("romaji-dict");
  });
});
