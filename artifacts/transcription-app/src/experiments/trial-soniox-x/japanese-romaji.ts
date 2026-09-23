/**
 * Trial · Soniox X only.
 *
 * Extra Latin-letter reading under Japanese script. The Japanese characters stay.
 * The dictionary loads only after the user turns Romaji on.
 */
import { toRomaji } from "wanakana";

const JA_SCRIPT_RE =
  /[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9D]/;
const KANA_RE = /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D]/;
const PUNCT_RE = /^[\s、。．，.!?！？・…「」『』（）()[\]【】:：;；，\-—〜~]+$/u;

export type ReadingToken = {
  surface: string;
  reading?: string;
  pos?: string;
};

type KuromojiToken = {
  surface_form: string;
  reading?: string;
  pos?: string;
};

type KuromojiTokenizer = {
  tokenize: (text: string) => KuromojiToken[];
};

type KuromojiModule = {
  builder: (opts: { dicPath: string }) => {
    build: (cb: (err: Error | null, tokenizer: KuromojiTokenizer) => void) => void;
  };
};

let tokenizer: KuromojiTokenizer | null = null;
let loading: Promise<void> | null = null;
const cache = new Map<string, string>();
const CACHE_MAX = 400;

export function containsJapaneseScript(text: string): boolean {
  return JA_SCRIPT_RE.test(text ?? "");
}

/** Show the extra reading only under text that is actually Japanese. */
export function shouldShowJapaneseReading(text: string, enabled: boolean): boolean {
  return enabled && containsJapaneseScript(text);
}

function tokenReading(token: ReadingToken): string {
  const surface = token.surface ?? "";
  const pos = token.pos ?? "";
  if (!surface) return "";
  if (surface === "は" && pos.startsWith("助詞")) return "wa";
  if (surface === "へ" && pos.startsWith("助詞")) return "e";
  if (surface === "を" && (pos.startsWith("助詞") || !token.reading || token.reading === "ヲ")) return "o";
  const reading = token.reading && token.reading !== "*" ? token.reading : "";
  if (reading && KANA_RE.test(reading)) return toRomaji(reading);
  if (KANA_RE.test(surface) && !JA_SCRIPT_RE.test(surface.replace(KANA_RE, ""))) return toRomaji(surface);
  return surface;
}

/** Spaced Hepburn from tokenizer tokens. Japanese script is not replaced here. */
export function readingsToRomaji(tokens: readonly ReadingToken[]): string {
  const parts: string[] = [];
  for (const token of tokens) {
    const surface = token.surface ?? "";
    if (!surface) continue;
    if (PUNCT_RE.test(surface)) {
      const mark = surface.trim();
      if (!mark) continue;
      if (parts.length === 0) parts.push(mark);
      else parts[parts.length - 1] = `${parts[parts.length - 1]}${mark}`;
      continue;
    }
    const piece = tokenReading(token).replace(/\s+/g, " ").trim();
    if (!piece) continue;
    parts.push(piece);
  }
  return parts
    .join(" ")
    .replace(/\s+([、。．，.!?！？])/g, "$1")
    .replace(/。/g, ".")
    .replace(/、/g, ", ")
    .replace(/！/g, "!")
    .replace(/？/g, "?")
    .replace(/\bkonnichiha\b/g, "konnichiwa")
    .replace(/\bkonbanha\b/g, "konbanwa")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

function dictPath(): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}kuromoji-dict/`;
}

export function ensureJapaneseRomaji(): Promise<void> {
  if (tokenizer) return Promise.resolve();
  if (!loading) {
    loading = import("kuromoji")
      .then((mod) => {
        const kuromoji = ((mod as { default?: KuromojiModule }).default ?? mod) as KuromojiModule;
        return new Promise<void>((resolve, reject) => {
          kuromoji.builder({ dicPath: dictPath() }).build((err, built) => {
            if (err || !built) {
              loading = null;
              reject(err ?? new Error("Japanese romaji dictionary failed to load"));
              return;
            }
            tokenizer = built;
            resolve();
          });
        });
      })
      .catch((err: unknown) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

export function japaneseTextToRomaji(text: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || !tokenizer || !containsJapaneseScript(clean)) return "";
  const hit = cache.get(clean);
  if (hit != null) return hit;
  const tokens = tokenizer.tokenize(clean).map((token) => ({
    surface: token.surface_form,
    reading: token.reading,
    pos: token.pos,
  }));
  const romaji = readingsToRomaji(tokens);
  if (cache.size > CACHE_MAX) cache.clear();
  cache.set(clean, romaji);
  return romaji;
}
