import axios, { isAxiosError, type AxiosRequestConfig } from "axios";
import * as dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { logger } from "./logger.js";

/** Keep sockets warm to Libre — fewer TCP handshakes per session. */
const LIBRE_HTTP_AGENT = new http.Agent({ keepAlive: true, maxSockets: 48 });
const LIBRE_HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 48 });

/** **Final Boss 3 · Libre** — primary machine translation (Basic / Professional / trial-libre). No public mirror list. */

/** Dedicated Interpreter AI LibreTranslate (Hetzner). Override with `LIBRETRANSLATE_INTERNAL_URL` or `LIBRETRANSLATE_URL` if the host changes. */
const HARDCODED_PRIMARY_BASE = "http://178.156.211.226:5000";

/**
 * `LIBRETRANSLATE_INTERNAL_URL` or `LIBRETRANSLATE_URL` overrides the default base (no trailing `/translate`).
 * Scheme: required for ambiguity; otherwise bare IPv4 → `http://`, `.railway.internal` → `http://`, else `https://`.
 */
function resolveConfiguredLibreBase(): string {
  const override =
    process.env.LIBRETRANSLATE_INTERNAL_URL?.trim() ||
    process.env.LIBRETRANSLATE_URL?.trim();
  const raw = (override || HARDCODED_PRIMARY_BASE).trim();
  if (!raw) return HARDCODED_PRIMARY_BASE;
  const noTrail = raw.replace(/\/$/, "");
  if (/^https?:\/\//i.test(noTrail)) return noTrail;
  const hostOnly = noTrail.split(":")[0] ?? noTrail;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostOnly)) return `http://${noTrail}`;
  if (/\.railway\.internal/i.test(noTrail)) return `http://${noTrail}`;
  return `https://${noTrail}`;
}

/** Resolved base used for every Libre request (env or default Hetzner). */
export const CONFIGURED_BASE = resolveConfiguredLibreBase();

const PER_HOST_TIMEOUT_MS = 25_000;

/** Railway private DNS is often IPv6-heavy; custom lookup avoids broken A/AAAA ordering. */
const libreTranslateDnsLookup: NonNullable<AxiosRequestConfig["lookup"]> = (
  hostname,
  options,
  cb,
) => {
  dns.lookup(
    hostname,
    { ...(options as dns.LookupOneOptions), family: 0, verbatim: true },
    (err, address, family) => {
      if (err) {
        cb(err, "", undefined);
        return;
      }
      const fam = family === 6 ? 6 : family === 4 ? 4 : undefined;
      cb(null, address, fam);
    },
  );
};

function useRailwayPrivateDnsLookup(baseUrl: string): boolean {
  try {
    return /\.railway\.internal$/i.test(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

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
  _sourceHint: string,
  target: string,
  sourceMode: "explicit" | "auto",
): Promise<string> {
  const tgt = normalizeLibreLang(target);
  const src = sourceMode === "auto" ? "auto" : normalizeLibreLang(_sourceHint);
  const body: Record<string, unknown> = {
    q: text,
    source: src,
    target: tgt,
    format: "text",
  };

  let res;
  try {
    const axiosOpts: AxiosRequestConfig = {
      timeout: PER_HOST_TIMEOUT_MS,
      validateStatus: () => true,
      httpAgent: baseUrl.startsWith("http:") ? LIBRE_HTTP_AGENT : undefined,
      httpsAgent: baseUrl.startsWith("https:") ? LIBRE_HTTPS_AGENT : undefined,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      ...(useRailwayPrivateDnsLookup(baseUrl) ? { lookup: libreTranslateDnsLookup } : {}),
    };
    res = await axios.post(`${baseUrl}/translate`, body, axiosOpts);
  } catch (err: unknown) {
    const code = isAxiosError(err) ? err.code : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { baseUrl, code, message: msg, source: src, target: tgt },
      "LibreTranslate request failed",
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

/** Primary path: `source: "auto"` (private Hetzner; no api_key). */
async function callLibreTranslateOneHost(
  baseUrl: string,
  text: string,
  source: string,
  target: string,
): Promise<string> {
  return callLibreTranslateAtBase(baseUrl, text, source, target, "auto");
}

/** Single primary endpoint — no public mirror fallback. */
export async function callLibreTranslate(text: string, source: string, target: string): Promise<string> {
  return callLibreTranslateOneHost(CONFIGURED_BASE, text, source, target);
}

export function logLibreMachineTranslationStartupHint(): void {
  const fromEnv = Boolean(
    process.env.LIBRETRANSLATE_INTERNAL_URL?.trim() || process.env.LIBRETRANSLATE_URL?.trim(),
  );
  logger.info(
    {
      soleBaseUrl: CONFIGURED_BASE,
      fromEnvOverride: fromEnv,
      noPublicFallback: true,
      railwayPrivateDnsLookup: useRailwayPrivateDnsLookup(CONFIGURED_BASE),
    },
    "LibreTranslate primary endpoint (Hetzner default — override with LIBRETRANSLATE_INTERNAL_URL if needed)",
  );
}
