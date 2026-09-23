import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readingsToRomaji } from "./japanese-romaji";

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

const dicPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../node_modules/kuromoji/dict");

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
        pos: token.pos,
      })),
    );
    expect(romaji).toMatch(/odenwa|o denwa/i);
    expect(romaji).toMatch(/arigat/i);
    expect(romaji).toMatch(/arabia/i);
    expect(romaji).toMatch(/tsuyaku|tsuuyaku/i);
    expect(romaji).toMatch(/mado/i);
    expect(romaji).not.toMatch(/[ぁ-んァ-ン一-龯]/);
  }, 20_000);
});
