/**
 * Trial · Soniox X only.
 *
 * Extra Latin-letter reading under Japanese script. The Japanese characters stay.
 * Dictionary files are fetched by name (not path.join + XHR). Gzip is inflated
 * only when the bytes are still gzip — a proxy that already unzipped .gz must
 * not be gunzipped a second time.
 */
import { toRomaji } from "wanakana";

const JA_SCRIPT_RE =
  /[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9D]/;
const KANA_RE = /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D]/;
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

type DictLoaderCtor = new (dicPath: string) => {
  loadArrayBuffer: (url: string, cb: (err: Error | null, buffer: ArrayBuffer | null) => void) => void;
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

/** Kana-only reading so something Latin is visible while the dictionary loads. */
export function kanaFallbackRomaji(text: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
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
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).arrayBuffer();
  }
  const zlibMod = await import("zlibjs/bin/gunzip.min.js");
  const zlib = ((zlibMod as { default?: { Zlib: { Gunzip: new (data: Uint8Array) => { decompress: () => Uint8Array } } } }).default ??
    zlibMod) as { Zlib: { Gunzip: new (data: Uint8Array) => { decompress: () => Uint8Array } } };
  return new zlib.Zlib.Gunzip(bytes).decompress().buffer;
}

async function fetchDictBuffer(filename: string): Promise<ArrayBuffer> {
  const res = await fetch(dictFileUrl(filename), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Romaji dictionary ${filename} ${res.status}`);
  return inflateDictBytes(await res.arrayBuffer());
}

function patchDictLoader(Loader: DictLoaderCtor, buffers: Map<string, ArrayBuffer>): void {
  Loader.prototype.loadArrayBuffer = function (
    url: string,
    cb: (err: Error | null, buffer: ArrayBuffer | null) => void,
  ) {
    const name = String(url).replace(/\\/g, "/").split("/").pop() ?? "";
    const buf = buffers.get(name);
    if (!buf) {
      cb(new Error(`Romaji dictionary missing ${name}`), null);
      return;
    }
    cb(null, buf);
  };
}

export function ensureJapaneseRomaji(): Promise<void> {
  if (tokenizer) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const [kuromojiMod, browserLoaderMod, nodeLoaderMod] = await Promise.all([
        import("kuromoji"),
        import("kuromoji/src/loader/BrowserDictionaryLoader.js").catch(() => null),
        import("kuromoji/src/loader/NodeDictionaryLoader.js").catch(() => null),
      ]);
      const kuromoji = ((kuromojiMod as { default?: KuromojiModule }).default ??
        kuromojiMod) as KuromojiModule;
      const buffers = new Map<string, ArrayBuffer>();
      await Promise.all(
        DICT_FILES.map(async (name) => {
          buffers.set(name, await fetchDictBuffer(name));
        }),
      );
      for (const loaderMod of [browserLoaderMod, nodeLoaderMod]) {
        if (!loaderMod) continue;
        const Loader = ((loaderMod as { default?: DictLoaderCtor }).default ??
          loaderMod) as DictLoaderCtor;
        if (typeof Loader === "function") patchDictLoader(Loader, buffers);
      }
      await new Promise<void>((resolve, reject) => {
        kuromoji.builder({ dicPath: "/kuromoji-dict/" }).build((err, built) => {
          if (err || !built) {
            reject(err ?? new Error("Japanese romaji dictionary failed to load"));
            return;
          }
          tokenizer = built;
          resolve();
        });
      });
    })().catch((err: unknown) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

export function japaneseTextToRomaji(text: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || !containsJapaneseScript(clean)) return "";
  const hit = cache.get(clean);
  if (hit != null) return hit;
  if (!tokenizer) return kanaFallbackRomaji(clean);
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
