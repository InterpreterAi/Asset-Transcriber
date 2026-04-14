import axios from "axios";
import { logger } from "./logger.js";

/**
 * Cloud Translation API (v2) — server-side key only, never exposed to the browser.
 * https://cloud.google.com/translate/docs/reference/rest/v2/translate
 *
 * Set one of:
 *   GOOGLE_TRANSLATE_API_KEY
 *   GOOGLE_CLOUD_TRANSLATION_API_KEY
 */
const API_KEY =
  process.env.GOOGLE_TRANSLATE_API_KEY?.trim() ||
  process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY?.trim();

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
const TIMEOUT_MS = 28_000;
/** Stay under documented limits; long utterances are rare for live segments. */
const MAX_CHUNK_CODE_UNITS = 12_000;

export function isGoogleTranslateConfigured(): boolean {
  return Boolean(API_KEY);
}

/** Map client / Soniox hints to Google-supported codes. */
export function normalizeGoogleLang(code: string): string {
  const raw = code.trim().toLowerCase();
  const base = raw.split("-")[0] ?? raw;
  if (base === "iw") return "he";
  if (base === "zh") {
    if (raw.includes("tw") || raw.includes("hant")) return "zh-TW";
    return "zh-CN";
  }
  if (raw === "zh-cn" || raw === "zh-hans") return "zh-CN";
  if (raw === "zh-tw" || raw === "zh-hant") return "zh-TW";
  return base;
}

function splitForChunks(s: string, maxUnits: number): string[] {
  if (s.length <= maxUnits) return [s];
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + maxUnits, s.length);
    if (end < s.length) {
      const slice = s.slice(i, end);
      const breakAt = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("。"), slice.lastIndexOf("\n"));
      if (breakAt > 200) end = i + breakAt + 1;
    }
    out.push(s.slice(i, end).trim());
    i = end;
  }
  return out.filter(Boolean);
}

async function translateOneChunk(
  text: string,
  source: string,
  target: string,
): Promise<string> {
  if (!API_KEY) throw new Error("Google Translate API key not configured");

  const body: Record<string, unknown> = {
    q: text,
    target,
    format: "text",
  };
  if (source !== "auto") body.source = source;

  const res = await axios.post<{
    data?: { translations?: Array<{ translatedText?: string }> };
    error?: { message?: string; code?: number };
  }>(
    ENDPOINT,
    body,
    {
      params: { key: API_KEY },
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    },
  );

  if (res.status !== 200) {
    const msg = res.data?.error?.message ?? res.statusText;
    throw new Error(`Google Translate HTTP ${res.status}: ${msg}`);
  }
  const t = res.data?.data?.translations?.[0]?.translatedText;
  if (typeof t !== "string" || !t.trim()) {
    throw new Error("Google Translate returned empty translation");
  }
  return t;
}

/**
 * Translate plain text (no placeholders). Throws on total failure.
 */
export async function callGoogleTranslate(text: string, source: string, target: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const rawSrc = source.trim().toLowerCase();
  const src = rawSrc === "auto" ? "auto" : normalizeGoogleLang(source);
  const tgt = normalizeGoogleLang(target);
  if (src !== "auto" && src === tgt) return text;

  const parts = splitForChunks(trimmed, MAX_CHUNK_CODE_UNITS);
  const pieces: string[] = [];
  for (const part of parts) {
    pieces.push(await translateOneChunk(part, src, tgt));
  }
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

/** Startup / diagnostics: machine fallback uses Google or Libre only (see MACHINE_TRANSLATION_ENGINE). */
export function logGoogleTranslateStartupHint(): void {
  if (isGoogleTranslateConfigured()) {
    logger.info(
      "GOOGLE_TRANSLATE_API_KEY is set — Libre-tier machine fallback can use Google Cloud (when ENGINE is google or auto).",
    );
  } else {
    logger.warn(
      "GOOGLE_TRANSLATE_API_KEY is not set — Libre-tier machine fallback uses LibreTranslate unless MACHINE_TRANSLATION_ENGINE=google.",
    );
  }
}
