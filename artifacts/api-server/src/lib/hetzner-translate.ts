import axios, { isAxiosError, type AxiosRequestConfig } from "axios";
import * as dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { logger } from "./logger.js";

/** Keep sockets warm — fewer TCP handshakes per segment. */
const HETZNER_HTTP_AGENT = new http.Agent({ keepAlive: true, maxSockets: 48 });
const HETZNER_HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 48 });

/**
 * Primary **Hetzner** machine-translation host (LibreTranslate-compatible `/translate` API).
 * `*-libre` plans use this only — no public mirror list, no Railway private DNS default.
 */
const HARDCODED_PRIMARY_BASE = "http://178.156.211.226:5000";

/**
 * Optional override: `LIBRETRANSLATE_INTERNAL_URL` or `LIBRETRANSLATE_URL` (legacy names).
 * Values pointing at `*.railway.internal` are **ignored** so stale Railway env does not override Hetzner.
 */
function resolveConfiguredBase(): string {
  const rawOverride =
    process.env.LIBRETRANSLATE_INTERNAL_URL?.trim() ||
    process.env.LIBRETRANSLATE_URL?.trim();
  if (rawOverride && /\.railway\.internal/i.test(rawOverride)) {
    logger.warn(
      { ignoredOverride: rawOverride },
      "LIBRETRANSLATE_* still points at railway.internal — ignoring in favor of Hetzner primary (remove that env var in deploy)",
    );
    return HARDCODED_PRIMARY_BASE;
  }
  const raw = (rawOverride || HARDCODED_PRIMARY_BASE).trim();
  if (!raw) return HARDCODED_PRIMARY_BASE;
  const noTrail = raw.replace(/\/$/, "");
  if (/^https?:\/\//i.test(noTrail)) return noTrail;
  const hostOnly = noTrail.split(":")[0] ?? noTrail;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostOnly)) return `http://${noTrail}`;
  if (/\.railway\.internal/i.test(noTrail)) return `http://${noTrail}`;
  return `https://${noTrail}`;
}

/** Base URL used for every machine translate request (Hetzner default unless a valid override is set). */
export const CONFIGURED_BASE = resolveConfiguredBase();

const PER_HOST_TIMEOUT_MS = 25_000;

const railwayPrivateDnsLookup: NonNullable<AxiosRequestConfig["lookup"]> = (
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

function parseTranslateBody(data: unknown): { translatedText?: string; error?: string } {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const err = typeof o.error === "string" ? o.error : undefined;
    let text: string | undefined;
    if (typeof o.translatedText === "string") text = o.translatedText;
    else if (typeof o.translation === "string") text = o.translation;
    return { translatedText: text, error: err };
  }
  if (typeof data === "string") {
    try {
      return parseTranslateBody(JSON.parse(data) as unknown);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeTargetLang(code: string): string {
  const raw = code.trim().toLowerCase();
  const base = raw.split("-")[0] ?? raw;
  if (base === "iw") return "he";
  if (raw === "zh-tw" || raw === "zh-hant") return "zh";
  if (raw === "zh-cn" || raw === "zh-hans") return "zh";
  return base;
}

function looksLikeEnglish(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  const englishCue =
    /\b(the|and|you|your|for|with|this|that|from|have|need|please|patient|today|tomorrow|because|about|will|can|could|would|should)\b/;
  const spanishCue =
    /[áéíóúñü¿¡]|\b(el|la|los|las|para|con|porque|gracias|usted|paciente|hoy|manana|mañana|colonoscop)\w*\b/;
  const portugueseCue =
    /[ãõáàâêôç]|\b(o|a|os|as|para|com|porque|obrigad|voce|você|paciente|hoje|amanh)\w*\b/;
  const polishCue =
    /[ąćęłńóśźż]|\b(i|oraz|dla|z|jest|to|pacjent|dzisiaj|jutro|poniewa)\w*\b/;
  const arabicCue = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

  const en = englishCue.test(t);
  const es = spanishCue.test(t);
  const pt = portugueseCue.test(t);
  const pl = polishCue.test(t);
  const ar = arabicCue.test(t);
  if (!en && (es || pt || pl || ar)) return false;
  return en || (!es && !pt && !pl && !ar);
}

const RETRY_EXPLICIT_SOURCE_TO_EN = new Set(["ar", "es", "pt", "pl"]);

async function postTranslateAtBase(
  baseUrl: string,
  text: string,
  sourceHint: string,
  target: string,
): Promise<string> {
  const tgt = normalizeTargetLang(target);
  const srcHintBase = normalizeTargetLang(sourceHint);

  const requestOnce = async (sourceCode: string): Promise<string> => {
    const body: Record<string, unknown> = {
      q: text,
      source: sourceCode,
      target: tgt,
      format: "text",
    };

    let res;
    try {
      const axiosOpts: AxiosRequestConfig = {
        timeout: PER_HOST_TIMEOUT_MS,
        validateStatus: () => true,
        httpAgent: baseUrl.startsWith("http:") ? HETZNER_HTTP_AGENT : undefined,
        httpsAgent: baseUrl.startsWith("https:") ? HETZNER_HTTPS_AGENT : undefined,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        ...(useRailwayPrivateDnsLookup(baseUrl) ? { lookup: railwayPrivateDnsLookup } : {}),
      };
      res = await axios.post(`${baseUrl}/translate`, body, axiosOpts);
    } catch (err: unknown) {
      const code = isAxiosError(err) ? err.code : undefined;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(
        { baseUrl, code, message: msg, source: sourceCode, target: tgt },
        "Hetzner machine translate request failed",
      );
      throw err;
    }
    const contentType = String(res.headers["content-type"] ?? "");
    const payload = parseTranslateBody(res.data);
    logger.info(
      { baseUrl, source: sourceCode, target: tgt, status: res.status, contentType: contentType.slice(0, 80) },
      "Hetzner machine translate API response",
    );

    if (res.status !== 200) {
      const preview =
        typeof res.data === "string"
          ? res.data.slice(0, 200)
          : JSON.stringify(res.data ?? "").slice(0, 200);
      logger.error({ baseUrl, status: res.status, preview }, "Hetzner machine translate non-200 body preview");
      throw new Error(`Hetzner translate HTTP ${res.status}`);
    }
    const errMsg = payload.error;
    if (typeof errMsg === "string" && errMsg.trim()) {
      throw new Error(`Hetzner translate: ${errMsg}`);
    }
    const out = payload.translatedText;
    if (typeof out !== "string") {
      const preview = JSON.stringify(res.data ?? "").slice(0, 300);
      logger.error(
        { baseUrl, contentType, preview },
        "Hetzner translate response missing translatedText",
      );
      throw new Error("Hetzner translate returned no translatedText");
    }
    const trimmed = out.trim();
    if (!trimmed) {
      throw new Error("Hetzner translate returned empty translatedText");
    }
    return out;
  };

  const primarySourceCode =
    tgt === "en" && RETRY_EXPLICIT_SOURCE_TO_EN.has(srcHintBase)
      ? srcHintBase
      : "auto";
  const first = await requestOnce(primarySourceCode);
  if (
    tgt === "en" &&
    RETRY_EXPLICIT_SOURCE_TO_EN.has(srcHintBase) &&
    !looksLikeEnglish(first)
  ) {
    logger.warn(
      { sourceHint: srcHintBase, target: tgt },
      "Hetzner MT to English looked off; retrying once with explicit source",
    );
    if (primarySourceCode === srcHintBase) {
      return requestOnce("auto");
    }
    return requestOnce(srcHintBase);
  }
  return first;
}

/** `*-libre` tiers: one POST per segment, `source: auto`, no API key. */
export async function callHetznerTranslate(text: string, source: string, target: string): Promise<string> {
  return postTranslateAtBase(CONFIGURED_BASE, text, source, target);
}

export function logHetznerMachineTranslationStartupHint(): void {
  const rawOverride =
    process.env.LIBRETRANSLATE_INTERNAL_URL?.trim() ||
    process.env.LIBRETRANSLATE_URL?.trim();
  const fromEnv = Boolean(rawOverride && !/\.railway\.internal/i.test(rawOverride));
  logger.info(
    {
      primaryBaseUrl: CONFIGURED_BASE,
      fromEnvOverride: fromEnv,
      ignoredRailwayOverride: Boolean(rawOverride && /\.railway\.internal/i.test(rawOverride)),
      railwayPrivateDnsLookup: useRailwayPrivateDnsLookup(CONFIGURED_BASE),
    },
    "Hetzner machine translate primary endpoint (remove LIBRETRANSLATE_* if it still targets Railway)",
  );
}
