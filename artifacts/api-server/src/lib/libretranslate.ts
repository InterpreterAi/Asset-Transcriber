import axios from "axios";
import { logger } from "./logger.js";

const LIBRE_API_KEY = process.env.LIBRETRANSLATE_API_KEY?.trim();
const CONFIGURED_BASE = process.env.LIBRETRANSLATE_URL?.trim().replace(/\/$/, "");

/**
 * Free public LibreTranslate-compatible HTTPS roots (no API key).
 * Order: community mirrors from docs.libretranslate.com/community/mirrors, then older community hosts.
 * @see https://docs.libretranslate.com/community/mirrors/
 */
const DEFAULT_FREE_LIBRE_BASES = [
  "https://translate.fedilab.app",
  "https://translate.cutie.dating",
  "https://translate.argosopentech.com",
  "https://libretranslate.de",
  "https://translate.astian.org",
] as const;

const PER_HOST_TIMEOUT_MS = 22_000;

/** Map common BCP-47 tags to LibreTranslate API language codes. */
function normalizeLibreLang(code: string): string {
  const raw = code.trim().toLowerCase();
  const base = raw.split("-")[0] ?? raw;
  if (base === "iw") return "he";
  if (raw === "zh-tw" || raw === "zh-hant") return "zh";
  if (raw === "zh-cn" || raw === "zh-hans") return "zh";
  return base;
}

async function callLibreTranslateAtBase(
  baseUrl: string,
  text: string,
  source: string,
  target: string,
  sourceMode: "explicit" | "auto",
): Promise<string> {
  const tgt = normalizeLibreLang(target);
  const src = sourceMode === "auto" ? "auto" : normalizeLibreLang(source);
  const body: Record<string, unknown> = {
    q: text,
    source: src,
    target: tgt,
    format: "text",
  };
  if (LIBRE_API_KEY) body.api_key = LIBRE_API_KEY;

  const res = await axios.post<{ translatedText?: string; error?: string }>(
    `${baseUrl}/translate`,
    body,
    {
      timeout: PER_HOST_TIMEOUT_MS,
      validateStatus: () => true,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Some public instances block generic bot UAs; behave like a normal browser.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    },
  );

  if (res.status !== 200) {
    throw new Error(`LibreTranslate HTTP ${res.status}`);
  }
  const msg = res.data?.error;
  if (typeof msg === "string" && msg.trim()) {
    throw new Error(`LibreTranslate: ${msg}`);
  }
  const out = res.data?.translatedText;
  if (typeof out !== "string") {
    throw new Error("LibreTranslate returned no translatedText");
  }
  const trimmed = out.trim();
  if (!trimmed) {
    throw new Error("LibreTranslate returned empty translatedText");
  }
  return out;
}

/** One host: explicit source first, then `source=auto` if the instance supports it (common for STT code drift). */
async function callLibreTranslateOneHost(
  baseUrl: string,
  text: string,
  source: string,
  target: string,
): Promise<string> {
  try {
    return await callLibreTranslateAtBase(baseUrl, text, source, target, "explicit");
  } catch (errExplicit) {
    if (normalizeLibreLang(source) === normalizeLibreLang(target)) {
      throw errExplicit;
    }
    try {
      return await callLibreTranslateAtBase(baseUrl, text, source, target, "auto");
    } catch (errAuto) {
      throw errAuto;
    }
  }
}

/**
 * Free tier: public LibreTranslate hosts (no key). Tries each base until one succeeds.
 * Set LIBRETRANSLATE_URL to pin one instance first; otherwise DEFAULT_FREE_LIBRE_BASES are tried in order.
 */
export async function callLibreTranslate(text: string, source: string, target: string): Promise<string> {
  const bases: string[] = CONFIGURED_BASE
    ? [CONFIGURED_BASE, ...DEFAULT_FREE_LIBRE_BASES.filter((b) => b !== CONFIGURED_BASE)]
    : [...DEFAULT_FREE_LIBRE_BASES];

  let lastErr: unknown;
  for (const base of bases) {
    try {
      return await callLibreTranslateOneHost(base, text, source, target);
    } catch (err) {
      lastErr = err;
      if (bases.length > 1) {
        logger.warn({ err, base }, "LibreTranslate host failed; trying next free endpoint");
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("LibreTranslate: all endpoints failed");
}

/** Startup hint: *-libre tiers use LibreTranslate only (no Google Cloud Translation). */
export function logLibreMachineTranslationStartupHint(): void {
  if (CONFIGURED_BASE) {
    logger.info(
      { base: CONFIGURED_BASE },
      "*-libre machine translation uses LibreTranslate (LIBRETRANSLATE_URL).",
    );
  } else {
    logger.info(
      "*-libre machine translation uses free public LibreTranslate endpoints; set LIBRETRANSLATE_URL to pin an instance.",
    );
  }
}
