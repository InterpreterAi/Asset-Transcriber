import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  containsJapaneseScript,
  containsKanji,
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
    expect(containsKanji("お元気ですか")).toBe(true);
    expect(containsKanji("こんにちは")).toBe(false);
    expect(shouldShowJapaneseReading("こんにちは", true)).toBe(true);
    expect(shouldShowJapaneseReading("こんにちは", false)).toBe(false);
    expect(shouldShowJapaneseReading("Hello", true)).toBe(false);
  });

  it("reads a Japanese sentence in Latin letters without dropping the words", () => {
    const romaji = readingsToRomaji([
      { surface: "具合", reading: "グアイ", pos: "名詞" },
      { surface: "は", reading: "ハ", pronunciation: "ワ", pos: "助詞" },
      { surface: "どう", reading: "ドウ", pos: "副詞" },
      { surface: "です", reading: "デス", pos: "助動詞" },
      { surface: "か", reading: "カ", pos: "助詞" },
      { surface: "。", pos: "記号" },
    ]);
    expect(romaji).toBe("guai wa dou desu ka.");
  });

  it("glues verb stems to auxiliaries so endings match the Japanese word", () => {
    expect(
      readingsToRomaji([
        { surface: "行き", reading: "イキ", pos: "動詞" },
        { surface: "ます", reading: "マス", pos: "助動詞" },
      ]),
    ).toBe("ikimasu");
    expect(
      readingsToRomaji([
        { surface: "お", reading: "オ", pos: "接頭詞" },
        { surface: "電話", reading: "デンワ", pos: "名詞" },
      ]),
    ).toBe("odenwa");
    expect(
      readingsToRomaji([
        { surface: "アラビア", reading: "アラビア", pos: "名詞" },
        { surface: "語", reading: "ゴ", pos: "名詞" },
      ]),
    ).toBe("arabiago");
  });

  it("keeps English and fixes the set greeting", () => {
    expect(
      readingsToRomaji([
        { surface: "こんにちは", reading: "コンニチハ", pos: "感動詞" },
        { surface: "MRI", pos: "名詞" },
      ]),
    ).toBe("konnichiwa MRI");
  });

  it("never invents a kana-only line that drops kanji before the dictionary loads", () => {
    expect(kanaFallbackRomaji("ありがとうございます。")).toBe("arigatougozaimasu.");
    expect(kanaFallbackRomaji("お元気ですか")).toBe("");
    expect(kanaFallbackRomaji("こんにちは")).toBe("konnichiwa");
    expect(isGzipBuffer(new Uint8Array([0x1f, 0x8b, 0x08]))).toBe(true);
    expect(isGzipBuffer(new Uint8Array([0x00, 0x00]))).toBe(false);
  });

  it("does not import kuromoji's Node fs dictionary loader", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./japanese-romaji.ts", import.meta.url), "utf8"),
    );
    expect(src).not.toMatch(/loader\/NodeDictionaryLoader/);
    expect(src).not.toMatch(/from ["']fs["']/);
    expect(src).not.toMatch(/zlibjs\/bin/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).toMatch(/BrowserDictionaryLoader/);
    expect(src).toMatch(/patchDictLoader/);
  });

  it("inflates gzip dict bytes and leaves already-plain bytes alone", async () => {
    const raw = new TextEncoder().encode("romaji-dict");
    const gz = gzipSync(raw);
    const inflated = new Uint8Array(await inflateDictBytes(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength)));
    expect(new TextDecoder().decode(inflated)).toBe("romaji-dict");
    const plain = await inflateDictBytes(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    expect(new TextDecoder().decode(new Uint8Array(plain))).toBe("romaji-dict");
  });

  it("placeholder ellipsis is only for in-flight loads, not failures", () => {
    // Mirrors ScriptReadingLine: reading || (ready || failed ? "" : "…")
    const display = (reading: string, ready: boolean, failed: boolean) =>
      reading || (ready || failed ? "" : "…");
    expect(display("", false, false)).toBe("…");
    expect(display("", true, false)).toBe("");
    expect(display("", false, true)).toBe("");
    expect(display("konnichiwa", false, false)).toBe("konnichiwa");
  });

  it("vite aliases Node path so kuromoji path.join works in the browser", async () => {
    const vite = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../../vite.config.ts", import.meta.url), "utf8"),
    );
    expect(vite).toMatch(/path-shim/);
    expect(vite).toMatch(/path:\s*path\.resolve/);
  });
});
