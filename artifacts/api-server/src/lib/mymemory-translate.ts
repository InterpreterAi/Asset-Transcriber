import axios from "axios";
import { logger } from "./logger.js";

const MYMEMORY_GET = "https://api.mymemory.translated.net/get";
/** Official max for `q` is500 UTF-8 bytes; stay under to avoid rejections. */
const MAX_Q_BYTES = 480;
const TIMEOUT_MS = 20_000;

function splitUtf8Chunks(s: string, maxBytes: number): string[] {
  if (!s) return [""];
  const chunks: string[] = [];
  let cur = "";
  let used = 0;
  for (const ch of s) {
    const nb = new TextEncoder().encode(ch).byteLength;
    if (used + nb > maxBytes && cur.length > 0) {
      chunks.push(cur);
      cur = ch;
      used = nb;
    } else {
      cur += ch;
      used += nb;
    }
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

type MyMemoryResponse = {
  responseData?: { translatedText?: string };
  responseStatus?: number;
  quotaFinished?: boolean;
  responseDetails?: string;
};

/**
 * MyMemory free tier: no API key; strict limits (~500 bytes per request, low daily quota per IP).
 * Use only as last resort when LibreTranslate public hosts fail. Not suitable as primary for heavy SaaS load.
 */
export async function callMyMemoryTranslate(text: string, source: string, target: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const src = source.split("-")[0]!.toLowerCase();
  const tgt = target.split("-")[0]!.toLowerCase();
  if (src === tgt) return text;

  const langpair = `${src}|${tgt}`;
  const parts = splitUtf8Chunks(trimmed, MAX_Q_BYTES);
  const out: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const q = parts[i]!;
    const res = await axios.get<MyMemoryResponse>(MYMEMORY_GET, {
      params: { q, langpair },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
      headers: { Accept: "application/json", "User-Agent": "InterpreterAI-API/1.0" },
    });

    if (res.status !== 200) {
      throw new Error(`MyMemory HTTP ${res.status}`);
    }
    const data = res.data;
    if (data.quotaFinished) {
      throw new Error("MyMemory daily quota exhausted");
    }
    const st = data.responseStatus;
    if (st != null && st !== 200) {
      logger.warn({ responseStatus: st, details: data.responseDetails }, "MyMemory non-200 responseStatus");
      throw new Error(`MyMemory responseStatus ${st}`);
    }
    const seg = data.responseData?.translatedText;
    if (typeof seg !== "string") {
      throw new Error("MyMemory returned no translatedText");
    }
    out.push(seg);
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}
