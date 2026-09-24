import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inflateDictBytes, isGzipBuffer, readingsToRomaji } from "./japanese-romaji";

const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji") as {
  builder: (opts: { dicPath: string }) => {
    build: (
      cb: (
        err: Error | null,
        tokenizer: {
          tokenize: (text: string) => Array<{ surface_form: string; reading?: string; pos?: string }>;
        },
      ) => void,
    ) => void;
  };
};

const NodeDictionaryLoader = require("kuromoji/src/loader/NodeDictionaryLoader.js") as {
  prototype: {
    loadArrayBuffer: (url: string, cb: (err: Error | null, buffer: ArrayBuffer | null) => void) => void;
  };
};

const dicPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../node_modules/kuromoji/dict");

const DICT_FILES = [
  "base.dat.gz",
  "check.dat.gz",
  "tid.dat.gz",
  "tid_pos.dat.gz",
  "tid_map.dat.gz",
  "cc.dat.gz",
  "unk.dat.gz",
  "unk_pos.dat.gz",
  "unk_map.dat.gz",
  "unk_char.dat.gz",
  "unk_compat.dat.gz",
  "unk_invoke.dat.gz",
] as const;

describe("live kuromoji romaji", () => {
  it("reads the interpreter Japanese line in Latin letters", async () => {
    const tokenizer = await new Promise<{
      tokenize: (text: string) => Array<{ surface_form: string; reading?: string; pos?: string }>;
    }>((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, built) => {
        if (err || !built) reject(err ?? new Error("tokenizer"));
        else resolve(built);
      });
    });
    const text = "お電話ありがとうございます。アラビア語通訳の窓口です。お元気ですか？";
    const romaji = readingsToRomaji(
      tokenizer.tokenize(text).map((token) => ({
        surface: token.surface_form,
        reading: token.reading,
        pronunciation: token.pronunciation,
        pos: token.pos,
      })),
    );
    expect(romaji).toMatch(/odenwa/i);
    expect(romaji).toMatch(/arigat/i);
    expect(romaji).toMatch(/gozaimasu/i);
    expect(romaji).toMatch(/arabiago/i);
    expect(romaji).toMatch(/tsuyaku|tsuuyaku/i);
    expect(romaji).toMatch(/madoguchi/i);
    expect(romaji).not.toMatch(/[ぁ-んァ-ン一-龯]/);
    expect(romaji).not.toMatch(/\biki masu\b/i);
  }, 20_000);

  it("builds a tokenizer from pre-inflated buffers the way the browser loader patch does", async () => {
    const buffers = new Map<string, ArrayBuffer>();
    await Promise.all(
      DICT_FILES.map(async (name) => {
        const raw = await fs.readFile(path.join(dicPath, name));
        const bytes = new Uint8Array(raw);
        if (isGzipBuffer(bytes)) {
          const inflated = gunzipSync(bytes);
          buffers.set(name, inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength));
        } else {
          buffers.set(name, await inflateDictBytes(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)));
        }
      }),
    );
    const original = NodeDictionaryLoader.prototype.loadArrayBuffer;
    NodeDictionaryLoader.prototype.loadArrayBuffer = function (
      url: string,
      cb: (err: Error | null, buffer: ArrayBuffer | null) => void,
    ) {
      const name = String(url).replace(/\\/g, "/").split("/").pop()?.split("?")[0] ?? "";
      const buf = buffers.get(name);
      if (!buf) {
        cb(new Error(`missing ${name}`), null);
        return;
      }
      cb(null, buf.slice(0));
    };
    try {
      const tokenizer = await new Promise<{
        tokenize: (text: string) => Array<{ surface_form: string; reading?: string; pos?: string }>;
      }>((resolve, reject) => {
        kuromoji.builder({ dicPath: "/kuromoji-dict/" }).build((err, built) => {
          if (err || !built) reject(err ?? new Error("tokenizer"));
          else resolve(built);
        });
      });
      const romaji = readingsToRomaji(
        tokenizer.tokenize("日本語の窓口です。").map((token) => ({
          surface: token.surface_form,
          reading: token.reading,
          pronunciation: token.pronunciation,
          pos: token.pos,
        })),
      );
      expect(romaji).toMatch(/nihongo/i);
      expect(romaji).toMatch(/madoguchi/i);
      expect(romaji).not.toMatch(/[ぁ-んァ-ン一-龯]/);
    } finally {
      NodeDictionaryLoader.prototype.loadArrayBuffer = original;
    }
  }, 20_000);
});
