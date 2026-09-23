/**
 * Trial · Soniox X only.
 *
 * Extra Latin-letter reading under Japanese script. The Japanese characters stay.
 * Prefetch the dict as gzip bytes and hand those to kuromoji's own XHR loader.
 * Do not import kuromoji's Node `fs` loader — that breaks the Railway Vite build.
 *
 * Accuracy rules for interpreters:
 * - Never show a kana-only fallback when the line still has kanji (that drops words).
 * - Prefer IPAdic pronunciation for particles (は→ワ) and reading for content words.
 * - Glue 接頭詞 + noun and verb/adj + 助動詞 so "行きます" → "ikimasu", not "iki masu".
 * - Never emit raw kanji into the Latin line.
 */
import { toRomaji } from "wanakana";

const JA_SCRIPT_RE =
  /[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9D]/;
const KANA_RE = /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D]/;
const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const PUNCT_RE = /^[\s、。．，.!?！？・…「」『』（）()[\]【】:：;；，\-—〜~]+$/u;

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

export type ReadingToken = {
  surface: string;
  reading?: string;
  pronunciation?: string;
  pos?: string;
};

type KuromojiToken = {
  surface_form: string;
  reading?: string;
  pronunciation?: string;
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

/** Surface-form overrides when IPAdic picks a rare/wrong reading for interpreter text. */
const SURFACE_READING_OVERRIDES: Record<string, string> = {
  日本: "ニホン",
  日本語: "ニホンゴ",
  今日: "キョウ",
  明日: "アシタ",
  昨日: "キノウ",
  一人: "ヒトリ",
  二人: "フタリ",
  一日: "イチニチ",
  大人: "オトナ",
  下手: "ヘタ",
  上手: "ジョウズ",
  役割: "ヤクワリ",
  風邪: "カゼ",
};

export function containsJapaneseScript(text: string): boolean {
  return JA_SCRIPT_RE.test(text ?? "");
}

export function containsKanji(text: string): boolean {
  return KANJI_RE.test(text ?? "");
}

/** Show the extra reading only under text that is actually Japanese. */
export function shouldShowJapaneseReading(text: string, enabled: boolean): boolean {
  return enabled && containsJapaneseScript(text);
}

function katakanaOnly(value: string | undefined | null): string {
  const raw = (value ?? "").trim();
  if (!raw || raw === "*") return "";
  return KANA_RE.test(raw) ? raw : "";
}

function posBase(pos: string | undefined): string {
  return (pos ?? "").split(",")[0] ?? "";
}

function isParticle(pos: string | undefined): boolean {
  return posBase(pos) === "助詞";
}

function isAuxiliary(pos: string | undefined): boolean {
  return posBase(pos) === "助動詞";
}

function isVerbOrAdj(pos: string | undefined): boolean {
  const base = posBase(pos);
  return base === "動詞" || base === "形容詞" || base === "形容動詞";
}

function isPrefix(pos: string | undefined): boolean {
  return posBase(pos) === "接頭詞";
}

function isNoun(pos: string | undefined): boolean {
  return posBase(pos) === "名詞";
}

function isInterjection(pos: string | undefined): boolean {
  return posBase(pos) === "感動詞";
}

function tokenKana(token: ReadingToken): string {
  const surface = token.surface ?? "";
  if (!surface) return "";
  const override = SURFACE_READING_OVERRIDES[surface];
  if (override) return override;

  // Particles: IPAdic pronunciation already has ワ/エ for は/へ.
  if (surface === "は" && isParticle(token.pos)) {
    return katakanaOnly(token.pronunciation) || "ワ";
  }
  if (surface === "へ" && isParticle(token.pos)) {
    return katakanaOnly(token.pronunciation) || "エ";
  }
  if (surface === "を" && isParticle(token.pos)) {
    return "ヲ";
  }

  // Content words: dictionary reading is more stable Hepburn than elongated pronunciation
  // (アリガトウ → arigatou, not アリガトー → arigatoo).
  const reading = katakanaOnly(token.reading);
  if (reading) return reading;

  const pronunciation = katakanaOnly(token.pronunciation);
  if (pronunciation) return pronunciation;

  // Pure kana surface — romanize the characters themselves.
  if (KANA_RE.test(surface) && !KANJI_RE.test(surface)) return surface;

  // Unknown kanji with no reading: never dump kanji into the Latin line.
  return "";
}

function tokenReading(token: ReadingToken): string {
  const surface = token.surface ?? "";
  // Keep Latin / digit tokens as-is so "MRI" still appears under the Japanese line.
  if (/^[A-Za-z0-9][A-Za-z0-9+./%-]*$/.test(surface) && !JA_SCRIPT_RE.test(surface)) {
    return surface;
  }
  const kana = tokenKana(token);
  if (!kana) return "";
  return toRomaji(kana).replace(/\s+/g, " ").trim();
}

function shouldGlueToPrevious(prev: ReadingToken, next: ReadingToken): boolean {
  if (!prev.surface || !next.surface) return false;
  if (PUNCT_RE.test(prev.surface) || PUNCT_RE.test(next.surface)) return false;
  if (isPrefix(prev.pos)) return true;
  if ((isVerbOrAdj(prev.pos) || isAuxiliary(prev.pos) || isInterjection(prev.pos)) && isAuxiliary(next.pos)) {
    return true;
  }
  // Compound noun suffixes: アラビア + 語 → arabigo
  if (isNoun(prev.pos) && isNoun(next.pos) && next.surface.length <= 2) return true;
  return false;
}

/** Spaced Hepburn from tokenizer tokens. Japanese script is not replaced here. */
export function readingsToRomaji(tokens: readonly ReadingToken[]): string {
  const parts: string[] = [];
  let prevToken: ReadingToken | null = null;
  for (const token of tokens) {
    const surface = token.surface ?? "";
    if (!surface) continue;
    if (PUNCT_RE.test(surface)) {
      const mark = surface.trim();
      if (!mark) continue;
      if (parts.length === 0) parts.push(mark);
      else parts[parts.length - 1] = `${parts[parts.length - 1]}${mark}`;
      prevToken = token;
      continue;
    }
    const piece = tokenReading(token);
    if (!piece) {
      prevToken = token;
      continue;
    }
    if (parts.length > 0 && prevToken && shouldGlueToPrevious(prevToken, token)) {
      parts[parts.length - 1] = `${parts[parts.length - 1]}${piece}`;
    } else {
      parts.push(piece);
    }
    prevToken = token;
  }
  return polishRomaji(parts.join(" "));
}

function polishRomaji(text: string): string {
  return text
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

/**
 * Kana-only text while the dictionary loads.
 * Do NOT use this when the line still has kanji — kanji would be dropped and the
 * Latin line would no longer match the Japanese above it.
 */
export function kanaFallbackRomaji(text: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (containsKanji(clean)) return "";
  const parts: string[] = [];
  const re = /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D]+|[A-Za-z0-9]+|[、。．，.!?！？]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(clean))) {
    const piece = match[0];
    if (/^[A-Za-z0-9]+$/.test(piece)) parts.push(piece);
    else if (/^[、。．，.!?！？]$/.test(piece)) {
      if (parts.length === 0) parts.push(piece);
      else parts[parts.length - 1] = `${parts[parts.length - 1]}${piece}`;
    } else parts.push(toRomaji(piece));
  }
  return polishRomaji(parts.join(" "));
}

export function dictFileUrl(filename: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}kuromoji-dict/${filename}`;
}

export function isGzipBuffer(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function inflateDictBytes(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buf);
  if (!isGzipBuffer(bytes)) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

async function fetchDictGzip(filename: string): Promise<Uint8Array> {
  const res = await fetch(dictFileUrl(filename), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Romaji dictionary ${filename} ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (isGzipBuffer(bytes)) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function installRomajiXhr(files: Map<string, Uint8Array>): () => void {
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
    (this as XMLHttpRequest & { __romajiUrl?: string }).__romajiUrl = String(url);
    return open.call(this, method, url, async ?? true, user, password);
  };
  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const url = (this as XMLHttpRequest & { __romajiUrl?: string }).__romajiUrl ?? "";
    const name = url.replace(/\\/g, "/").split("/").pop()?.split("?")[0] ?? "";
    const data = files.get(name);
    if (!data) return send.call(this, body);
    const xhr = this;
    Object.defineProperty(xhr, "status", { configurable: true, get: () => 200 });
    const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    Object.defineProperty(xhr, "response", { configurable: true, get: () => copy });
    queueMicrotask(() => xhr.onload?.(new ProgressEvent("load")));
  };
  return () => {
    XMLHttpRequest.prototype.open = open;
    XMLHttpRequest.prototype.send = send;
  };
}

export function ensureJapaneseRomaji(): Promise<void> {
  if (tokenizer) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const files = new Map<string, Uint8Array>();
      await Promise.all(
        DICT_FILES.map(async (name) => {
          files.set(name, await fetchDictGzip(name));
        }),
      );
      const kuromojiMod = await import("kuromoji");
      const kuromoji = ((kuromojiMod as { default?: KuromojiModule }).default ??
        kuromojiMod) as KuromojiModule;
      const undo = typeof XMLHttpRequest === "undefined" ? () => {} : installRomajiXhr(files);
      try {
        await new Promise<void>((resolve, reject) => {
          kuromoji.builder({ dicPath: "/kuromoji-dict/" }).build((err, built) => {
            if (err || !built) {
              reject(err ?? new Error("Japanese romaji dictionary failed to load"));
              return;
            }
            tokenizer = built;
            cache.clear();
            resolve();
          });
        });
      } finally {
        undo();
      }
    })().catch((err: unknown) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

export function japaneseRomajiReady(): boolean {
  return tokenizer != null;
}

/**
 * Latin reading for the exact Japanese string shown above.
 * Returns "" when the dictionary is still loading and the line has kanji —
 * callers should show "…" rather than a truncated kana-only guess.
 */
export function japaneseTextToRomaji(text: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || !containsJapaneseScript(clean)) return "";
  const hit = cache.get(clean);
  if (hit != null) return hit;
  if (!tokenizer) {
    // Incomplete kana-only guesses made interpreters think the wording was wrong.
    if (containsKanji(clean)) return "";
    return kanaFallbackRomaji(clean);
  }
  const tokens = tokenizer.tokenize(clean).map((token) => ({
    surface: token.surface_form,
    reading: token.reading,
    pronunciation: token.pronunciation,
    pos: token.pos,
  }));
  const romaji = readingsToRomaji(tokens);
  if (cache.size > CACHE_MAX) cache.clear();
  cache.set(clean, romaji);
  return romaji;
}
