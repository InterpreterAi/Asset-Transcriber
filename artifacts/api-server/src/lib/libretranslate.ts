import axios, { isAxiosError } from "axios";
import { logger } from "./logger.js";

/** **Final Boss 3 · Libre** — LibreTranslate HTTP client. Internal Railway URL only (no public fallback). */

function normalizeLibreBase(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return withScheme.replace(/\/$/, "");
}

/**
 * Sole endpoint: Railway private DNS. **http only** (never https for `.railway.internal`).
 * Libre listens on `[::]:5000` — IPv6 all interfaces; clients use hostname + port 5000.
 */
const HARDCODED_INTERNAL_BASE = "http://libretranslate.railway.internal:5000";

/** Resolved base used for every Libre request — must match redeployed Asset-Transcriber image. */
export const CONFIGURED_BASE = normalizeLibreBase(HARDCODED_INTERNAL_BASE);

const PER_HOST_TIMEOUT_MS = 3_000;

/** Libre `/translate` JSON: `{ translatedText?, error? }`. Proxies may return JSON as a string body. */
function parseLibreTranslateBody(data: unknown): { translatedText?: string; error?: string } {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    return data as { translatedText?: string; error?: string };
  }
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as { translatedText?: string; error?: string };
    } catch {
      return {};
    }
  }
  return {};
}

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

  let res;
  try {
    res = await axios.post(`${baseUrl}/translate`, body, {
      timeout: PER_HOST_TIMEOUT_MS,
      validateStatus: () => true,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
  } catch (err: unknown) {
    const code = isAxiosError(err) ? err.code : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { baseUrl, code, message: msg, source: src, target: tgt },
      "LibreTranslate request failed (check ECONNREFUSED = wrong service name / port)",
    );
    throw err;
  }
  const contentType = String(res.headers["content-type"] ?? "");
  const payload = parseLibreTranslateBody(res.data);
  logger.info(
    { baseUrl, source: src, target: tgt, status: res.status, contentType: contentType.slice(0, 80) },
    "LibreTranslate API response",
  );

  if (res.status !== 200) {
    const preview =
      typeof res.data === "string"
        ? res.data.slice(0, 200)
        : JSON.stringify(res.data ?? "").slice(0, 200);
    logger.error({ baseUrl, status: res.status, preview }, "LibreTranslate non-200 body preview");
    throw new Error(`LibreTranslate HTTP ${res.status}`);
  }
  const errMsg = payload.error;
  if (typeof errMsg === "string" && errMsg.trim()) {
    throw new Error(`LibreTranslate: ${errMsg}`);
  }
  const out = payload.translatedText;
  if (typeof out !== "string") {
    const preview = JSON.stringify(res.data ?? "").slice(0, 300);
    logger.error(
      { baseUrl, contentType, preview },
      "LibreTranslate response missing translatedText (wrong JSON or HTML error page)",
    );
    throw new Error("LibreTranslate returned no translatedText");
  }
  const trimmed = out.trim();
  if (!trimmed) {
    throw new Error("LibreTranslate returned empty translatedText");
  }
  return out;
}

/** One host, one direct attempt. */
async function callLibreTranslateOneHost(
  baseUrl: string,
  text: string,
  source: string,
  target: string,
): Promise<string> {
  return callLibreTranslateAtBase(baseUrl, text, source, target, "explicit");
}

/**
 * Single internal endpoint only — no public mirror fallback. Fails fast for networking issues.
 */
export async function callLibreTranslate(text: string, source: string, target: string): Promise<string> {
  if (!CONFIGURED_BASE) {
    throw new Error("LibreTranslate: CONFIGURED_BASE is unset (internal URL missing)");
  }
  return callLibreTranslateOneHost(CONFIGURED_BASE, text, source, target);
}

/** Startup: *-libre tiers use this URL only. Search logs for "LibreTranslate sole endpoint" after redeploy. */
export function logLibreMachineTranslationStartupHint(): void {
  logger.info(
    {
      soleBaseUrl: CONFIGURED_BASE,
      noPublicFallback: true,
    },
    "LibreTranslate sole endpoint (internal only — verify after Asset-Transcriber redeploy)",
  );
}
