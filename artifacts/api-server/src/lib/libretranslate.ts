import axios from "axios";
import { logger } from "./logger.js";

/** **Final Boss 3 · Libre** — LibreTranslate HTTP client (host rotation, lang normalization). Paired with `basic-pro-translate.ts`. */

function normalizeLibreBase(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return withScheme.replace(/\/$/, "");
}

const CONFIGURED_BASE = normalizeLibreBase(
  process.env.LIBRETRANSLATE_INTERNAL_URL ?? process.env.LIBRETRANSLATE_URL,
);
const PRELOADED_LANGS = new Set(
  (process.env.LIBRETRANSLATE_PRELOADED_LANGS ?? "en,ar,es,fr,de,it")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Free public LibreTranslate-compatible HTTPS roots (no API key).
 * Order: community mirrors from docs.libretranslate.com/community/mirrors, then older community hosts.
 * @see https://docs.libretranslate.com/community/mirrors/
 */
const DEFAULT_FREE_LIBRE_BASES = [
  "https://libretranslatelibretranslate-production-f84d.up.railway.app",
  "https://translate.fedilab.app",
  "https://translate.cutie.dating",
  "https://translate.argosopentech.com",
  "https://libretranslate.de",
  "https://translate.astian.org",
] as const;

// Private Railway Libre can take 10-15s on first unseen language model load.
// Keep generous timeout so first call doesn't fail/blank while model downloads.
const PER_HOST_TIMEOUT_MS = 45_000;

/** Map common BCP-47 tags to LibreTranslate API language codes. */
function normalizeLibreLang(code: string): string {
  const raw = code.trim().toLowerCase();
  const base = raw.split("-")[0] ?? raw;
  if (base === "iw") return "he";
  if (raw === "zh-tw" || raw === "zh-hant") return "zh";
  if (raw === "zh-cn" || raw === "zh-hans") return "zh";
  return base;
}

function assertPreloadedPair(source: string, target: string): void {
  const src = normalizeLibreLang(source);
  const tgt = normalizeLibreLang(target);
  if (!PRELOADED_LANGS.has(src) || !PRELOADED_LANGS.has(tgt)) {
    throw new Error(
      `LibreTranslate language pair not preloaded on private server: ${src}->${tgt}. ` +
      `Allowed languages: ${[...PRELOADED_LANGS].join(",")}`,
    );
  }
}

async function callLibreTranslateAtBase(
  baseUrl: string,
  text: string,
  source: string,
  target: string,
  sourceMode: "explicit" | "auto",
  signal?: AbortSignal,
): Promise<string> {
  const tgt = normalizeLibreLang(target);
  const src = sourceMode === "auto" ? "auto" : normalizeLibreLang(source);
  const body: Record<string, unknown> = {
    q: text,
    source: src,
    target: tgt,
    format: "text",
  };

  const res = await axios.post<{ translatedText?: string; error?: string }>(
    `${baseUrl}/translate`,
    body,
    {
      timeout: PER_HOST_TIMEOUT_MS,
      signal,
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
  logger.info(
    { baseUrl, source: src, target: tgt, status: res.status },
    "LibreTranslate API response",
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
  signal?: AbortSignal,
): Promise<string> {
  try {
    return await callLibreTranslateAtBase(baseUrl, text, source, target, "explicit", signal);
  } catch (errExplicit) {
    if (normalizeLibreLang(source) === normalizeLibreLang(target)) {
      throw errExplicit;
    }
    try {
      return await callLibreTranslateAtBase(baseUrl, text, source, target, "auto", signal);
    } catch (errAuto) {
      throw errAuto;
    }
  }
}

let libreQueueTail: Promise<void> = Promise.resolve();

async function enqueueLibre<T>(task: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = libreQueueTail;
  libreQueueTail = prev.then(() => next, () => next);
  await prev;
  try {
    return await task();
  } finally {
    release();
  }
}

/**
 * LibreTranslate hosts. Tries each base until one succeeds.
 * Set LIBRETRANSLATE_URL to pin one instance first; otherwise defaults are tried in order.
 */
export async function callLibreTranslate(
  text: string,
  source: string,
  target: string,
  signal?: AbortSignal,
): Promise<string> {
  // Private Railway memory guard: never trigger on-demand model downloads for non-preloaded languages.
  assertPreloadedPair(source, target);
  const bases: string[] = CONFIGURED_BASE
    ? [CONFIGURED_BASE]
    : [...DEFAULT_FREE_LIBRE_BASES];

  let lastErr: unknown;
  return enqueueLibre(async () => {
    for (const base of bases) {
      if (signal?.aborted) {
        throw new Error("LibreTranslate request aborted");
      }
      try {
        return await callLibreTranslateOneHost(base, text, source, target, signal);
      } catch (err) {
        lastErr = err;
        if (bases.length > 1) {
          logger.warn({ err, base }, "LibreTranslate host failed; trying next free endpoint");
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("LibreTranslate: all endpoints failed");
  });
}

/** Startup hint: *-libre tiers use LibreTranslate only (no Google Cloud Translation). */
export function logLibreMachineTranslationStartupHint(): void {
  if (CONFIGURED_BASE) {
    logger.info(
      { base: CONFIGURED_BASE },
      "*-libre machine translation uses LibreTranslate (LIBRETRANSLATE_URL). API key is not used for private server calls.",
    );
  } else {
    logger.info(
      "*-libre machine translation uses default LibreTranslate endpoints (private Railway first); set LIBRETRANSLATE_URL to pin an instance.",
    );
  }
}
