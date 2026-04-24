import axios, { isAxiosError, type AxiosRequestConfig } from "axios";
import * as dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { logger } from "./logger.js";
import { selectHetznerCoreRoute } from "./hetzner-core-router.js";

/** Keep sockets warm — fewer TCP handshakes per segment. */
const HETZNER_HTTP_AGENT = new http.Agent({ keepAlive: true, maxSockets: 48 });
const HETZNER_HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 48 });

const TRIAL_HETZNER_MAX_CONCURRENT = Math.max(
  1,
  Number.parseInt(process.env.TRIAL_HETZNER_MAX_CONCURRENT?.trim() ?? "2", 10) || 2,
);

/** Limits simultaneous outbound Hetzner MT calls for trial machine plans only (`trial-libre` + `trial-hetzner`). */
class TrialOutboundGate {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<void> {
    while (this.active >= this.max) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    this.active++;
  }
  release(): void {
    this.active--;
    const w = this.waiters.shift();
    if (w) w();
  }
}

const trialHetznerOutboundGate = new TrialOutboundGate(TRIAL_HETZNER_MAX_CONCURRENT);

/**
 * Primary **Hetzner** machine-translation host (LibreTranslate-compatible `/translate` API).
 * `*-libre` plans use this only — no public mirror list, no Railway private DNS default.
 */
const HARDCODED_PRIMARY_BASE = "http://178.156.211.226:5000";

/** Base URL is intentionally locked for `*-libre` (Hetzner) machine stack. */
export const CONFIGURED_BASE = HARDCODED_PRIMARY_BASE;

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

type DomainTermPack = {
  source: string;
  english: string;
  // Optional English variants we normalize to the canonical `english`.
  englishVariants?: string[];
};

const DOMAIN_TERMS_TO_EN: Record<string, DomainTermPack[]> = {
  ar: [
    { source: "تنظير القولون", english: "colonoscopy" },
    { source: "خزعة", english: "biopsy" },
    { source: "تشخيص", english: "diagnosis" },
    { source: "وصفة طبية", english: "prescription" },
    { source: "شركة التأمين", english: "insurance company" },
    { source: "وثيقة التأمين", english: "insurance policy" },
    { source: "قسط التأمين", english: "insurance premium" },
    { source: "الخصم", english: "deductible" },
    { source: "تغطية", english: "coverage" },
    { source: "دعوى قضائية", english: "lawsuit" },
    { source: "محام", english: "attorney", englishVariants: ["lawyer"] },
    { source: "تسوية", english: "settlement" },
    { source: "تعويض", english: "compensation" },
    { source: "مسؤولية", english: "liability" },
  ],
  es: [
    { source: "colonoscopia", english: "colonoscopy" },
    { source: "biopsia", english: "biopsy" },
    { source: "diagnóstico", english: "diagnosis" },
    { source: "endoscopia", english: "endoscopy" },
    { source: "compañía de seguros", english: "insurance company" },
    { source: "póliza", english: "policy", englishVariants: ["insurance policy"] },
    { source: "prima", english: "premium", englishVariants: ["insurance premium"] },
    { source: "deducible", english: "deductible" },
    { source: "cobertura", english: "coverage" },
    { source: "reclamación", english: "claim", englishVariants: ["insurance claim"] },
    { source: "demanda", english: "lawsuit" },
    { source: "abogado", english: "attorney", englishVariants: ["lawyer"] },
    { source: "acuerdo", english: "settlement" },
    { source: "responsabilidad", english: "liability" },
  ],
  pt: [
    { source: "colonoscopia", english: "colonoscopy" },
    { source: "biópsia", english: "biopsy" },
    { source: "diagnóstico", english: "diagnosis" },
    { source: "endoscopia", english: "endoscopy" },
    { source: "seguradora", english: "insurance company" },
    { source: "apólice", english: "policy", englishVariants: ["insurance policy"] },
    { source: "prêmio", english: "premium", englishVariants: ["insurance premium"] },
    { source: "franquia", english: "deductible" },
    { source: "cobertura", english: "coverage" },
    { source: "sinistro", english: "claim", englishVariants: ["insurance claim"] },
    { source: "processo", english: "lawsuit" },
    { source: "advogado", english: "attorney", englishVariants: ["lawyer"] },
    { source: "acordo", english: "settlement" },
    { source: "responsabilidade", english: "liability" },
  ],
  pl: [
    { source: "kolonoskopia", english: "colonoscopy" },
    { source: "biopsja", english: "biopsy" },
    { source: "diagnoza", english: "diagnosis" },
    { source: "endoskopia", english: "endoscopy" },
    { source: "ubezpieczyciel", english: "insurance company" },
    { source: "polisa", english: "policy", englishVariants: ["insurance policy"] },
    { source: "składka", english: "premium", englishVariants: ["insurance premium"] },
    { source: "udział własny", english: "deductible" },
    { source: "zakres ochrony", english: "coverage" },
    { source: "roszczenie", english: "claim", englishVariants: ["insurance claim"] },
    { source: "pozew", english: "lawsuit" },
    { source: "adwokat", english: "attorney", englishVariants: ["lawyer"] },
    { source: "ugoda", english: "settlement" },
    { source: "odpowiedzialność", english: "liability" },
  ],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fast deterministic domain normalization for non-English -> English machine output.
 * No network/model calls; only lightweight regex replacements when source terms are present.
 */
function applyFastDomainTerminologyToEnglish(
  sourceText: string,
  sourceBase: string,
  translated: string,
): string {
  const packs = DOMAIN_TERMS_TO_EN[sourceBase];
  if (!packs || packs.length === 0) return translated;

  const srcLower = sourceText.toLowerCase();
  let out = translated;
  for (const p of packs) {
    if (!srcLower.includes(p.source.toLowerCase())) continue;
    const variants = [p.source, ...(p.englishVariants ?? [])];
    for (const v of variants) {
      const re = new RegExp(`\\b${escapeRegex(v)}\\b`, "gi");
      out = out.replace(re, p.english);
    }
  }
  return out;
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
    const normalizedOut =
      tgt === "en" ? applyFastDomainTerminologyToEnglish(text, srcHintBase, out) : out;
    const trimmed = normalizedOut.trim();
    if (!trimmed) {
      throw new Error("Hetzner translate returned empty translatedText");
    }
    return normalizedOut;
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
export async function callHetznerTranslate(
  text: string,
  source: string,
  target: string,
  routingHint?: { planType?: string; sessionId?: number },
): Promise<string> {
  const plan = (routingHint?.planType ?? "").trim().toLowerCase();
  const useTrialOutboundGate = plan === "trial-libre" || plan === "trial-hetzner";

  const run = async () => {
    const route = selectHetznerCoreRoute(
      routingHint?.planType ?? "trial-libre",
      routingHint?.sessionId,
    );
    return postTranslateAtBase(route.baseUrl || CONFIGURED_BASE, text, source, target);
  };

  if (!useTrialOutboundGate) {
    return run();
  }

  await trialHetznerOutboundGate.acquire();
  try {
    return await run();
  } finally {
    trialHetznerOutboundGate.release();
  }
}

export function logHetznerMachineTranslationStartupHint(): void {
  const rawOverride =
    process.env.LIBRETRANSLATE_INTERNAL_URL?.trim() ||
    process.env.LIBRETRANSLATE_URL?.trim();
  logger.info(
    {
      primaryBaseUrl: CONFIGURED_BASE,
      trialHetznerMaxConcurrent: TRIAL_HETZNER_MAX_CONCURRENT,
      fromEnvOverride: false,
      ignoredEnvOverride: Boolean(rawOverride),
      railwayPrivateDnsLookup: useRailwayPrivateDnsLookup(CONFIGURED_BASE),
    },
    "Hetzner machine translate primary endpoint locked (env override disabled)",
  );
}
