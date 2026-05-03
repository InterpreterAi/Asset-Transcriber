#!/usr/bin/env node
/**
 * Fill missing interpreter glossary translations via a LibreTranslate-compatible API.
 * Operational batching: run with --limit periodically (e.g. 500), not full corpus at once.
 *
 * Env:
 *   LIBRETRANSLATE_URL  Base URL (default: https://libretranslate.com); prefer your Hetzner host in prod.
 *   FILL_DELAY_MS       Delay between requests (default: 350)
 *
 * Usage:
 *   pnpm --filter @workspace/api-server glossary:fill-mt -- --langs ar,es --domains insurance,medical,legal --limit 500
 *   node scripts/fill-interpreter-glossary-mt.mjs --file glossary_insurance.json --langs ar,es --limit 500
 *   node scripts/fill-interpreter-glossary-mt.mjs --domains insurance --langs ar,es --dry-run --limit 20
 *
 * Manual QA: after batches, review high-impact terms (diagnoses, statutes, policy terms) for ar/es accuracy.
 *
 * Target codes: maps BCP-47 tags to LibreTranslate `target` where needed (zh-CN → zh, nb → no).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");

/** Default domain order for --domains insurance,medical,legal */
const DOMAIN_TO_FILE = {
  insurance: "glossary_insurance.json",
  medical: "glossary_medical.json",
  legal: "glossary_legal.json",
  immigration: "glossary_immigration.json",
};

const ALL_LANGS = [
  "ar",
  "bg",
  "zh-CN",
  "zh-TW",
  "hr",
  "cs",
  "da",
  "nl",
  "fa",
  "fi",
  "fr",
  "de",
  "el",
  "he",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "ms",
  "nb",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "es",
  "sv",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
];

/** LibreTranslate `target` parameter (may differ from our BCP-47 tags). */
const TO_LIBRE = {
  ar: "ar",
  bg: "bg",
  "zh-CN": "zh",
  "zh-TW": "zh",
  hr: "hr",
  cs: "cs",
  da: "da",
  nl: "nl",
  fa: "fa",
  fi: "fi",
  fr: "fr",
  de: "de",
  el: "el",
  he: "he",
  hi: "hi",
  hu: "hu",
  id: "id",
  it: "it",
  ja: "ja",
  ko: "ko",
  ms: "ms",
  nb: "no",
  pl: "pl",
  pt: "pt",
  ro: "ro",
  ru: "ru",
  sk: "sk",
  es: "es",
  sv: "sv",
  th: "th",
  tr: "tr",
  uk: "uk",
  ur: "ur",
  vi: "vi",
};

function isLikelyAcronymGloss(en) {
  const core = en.replace(/[^A-Za-z0-9]/g, "");
  if (core.length <= 1) return true;
  if (core.length <= 12 && core === core.toUpperCase()) return true;
  return false;
}

function needsFillForLang(canonicalKey, raw, code) {
  const en = (raw.en ?? canonicalKey).trim();
  const v = raw[code]?.trim();
  if (!v) return true;
  if (v.toLowerCase() === en.toLowerCase() && !isLikelyAcronymGloss(en)) return true;
  return false;
}

async function translateLine(baseUrl, text, targetLibre, signal) {
  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: "en",
      target: targetLibre,
      format: "text",
    }),
    signal,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`translate ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const out = typeof j.translatedText === "string" ? j.translatedText.trim() : "";
  if (!out) throw new Error("empty translatedText");
  return out;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const out = {
    file: null,
    files: null,
    langs: null,
    limit: 500,
    dryRun: false,
    delayMs: Number(process.env.FILL_DELAY_MS ?? "350"),
  };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--file") out.file = a[++i];
    else if (a[i] === "--files") {
      out.files = a[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a[i] === "--domains") {
      const keys = a[++i]
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      out.files = keys.map((k) => DOMAIN_TO_FILE[k]).filter(Boolean);
      const bad = keys.filter((k) => !DOMAIN_TO_FILE[k]);
      if (bad.length) console.warn("unknown domain keys (skipped):", bad);
    } else if (a[i] === "--langs") {
      out.langs = a[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a[i] === "--limit") out.limit = Number(a[++i]);
    else if (a[i] === "--dry-run") out.dryRun = true;
    else if (a[i] === "--delay-ms") out.delayMs = Number(a[++i]);
  }
  return out;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function resolveLangCodes(requested) {
  if (!requested?.length) return ALL_LANGS;
  const out = [];
  for (const c of requested) {
    if (ALL_LANGS.includes(c)) out.push(c);
    else console.warn("unknown lang (skipped):", c);
  }
  return out.length ? out : ALL_LANGS;
}

function resolveFileList(parsed) {
  if (parsed.files?.length) return parsed.files;
  if (parsed.file) return [parsed.file];
  return ["glossary_insurance.json"];
}

/**
 * @returns {Promise<number>} API calls consumed toward budget
 */
async function fillOneFile(fp, langCodes, budget, dryRun, delayMs, baseUrl, globalCache) {
  if (!fs.existsSync(fp)) {
    console.error("file not found:", fp);
    return 0;
  }
  const glossary = JSON.parse(fs.readFileSync(fp, "utf8"));
  let calls = 0;

  outer: for (const [canonicalKey, row] of Object.entries(glossary)) {
    if (!row?.translations || typeof row.translations !== "object") continue;
    const en = (row.translations.en ?? canonicalKey).trim();
    if (!en) continue;

    for (const code of langCodes) {
      if (calls >= budget) break outer;
      if (!needsFillForLang(canonicalKey, row.translations, code)) continue;

      const targetLibre = TO_LIBRE[code];
      if (!targetLibre) continue;

      const cacheKey = `${en}\n${targetLibre}`;
      let translated;
      if (globalCache.has(cacheKey)) {
        translated = globalCache.get(cacheKey);
      } else {
        if (dryRun) {
          console.info("[dry-run] would translate", { file: path.basename(fp), en: en.slice(0, 80), target: code });
          translated = `[DRY-RUN:${code}]`;
        } else {
          console.info("translate", { file: path.basename(fp), calls, target: code, en: en.slice(0, 60) });
          translated = await translateLine(baseUrl, en, targetLibre, AbortSignal.timeout(25_000));
          await sleep(delayMs);
        }
        globalCache.set(cacheKey, translated);
        calls++;
      }
      row.translations[code] = translated;
    }
  }

  if (!dryRun && calls > 0) {
    const tmp = `${fp}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(glossary), "utf8");
    fs.renameSync(tmp, fp);
    console.info("updated", fp, "apiCallsThisFile", calls);
  } else if (calls === 0) {
    console.info("no changes", fp);
  }
  return calls;
}

async function main() {
  const parsed = parseArgs();
  const fileList = resolveFileList(parsed);
  const langCodes = resolveLangCodes(parsed.langs);
  const baseUrl = process.env.LIBRETRANSLATE_URL?.trim() || "https://libretranslate.com";
  let remaining = parsed.limit;
  const globalCache = new Map();
  let totalCalls = 0;

  console.info("fill-interpreter-glossary-mt", {
    files: fileList,
    langs: langCodes.join(","),
    limit: parsed.limit,
    dryRun: parsed.dryRun,
    baseUrl: baseUrl.slice(0, 48),
  });

  for (const fname of fileList) {
    if (remaining <= 0) break;
    const fp = path.join(DATA_DIR, fname);
    const used = await fillOneFile(
      fp,
      langCodes,
      remaining,
      parsed.dryRun,
      parsed.delayMs,
      baseUrl,
      globalCache,
    );
    totalCalls += used;
    remaining -= used;
  }

  console.info("done", { totalApiCalls: totalCalls, budget: parsed.limit });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
