#!/usr/bin/env node
/**
 * Fill missing interpreter glossary translations via a LibreTranslate-compatible API.
 * Does NOT run automatically — use for batch backfill with your own endpoint / limits.
 *
 * Env:
 *   LIBRETRANSLATE_URL  Base URL (default: https://libretranslate.com): e.g. your Hetzner host
 *   FILL_DELAY_MS       Delay between requests (default: 350)
 *
 * Usage:
 *   node scripts/fill-interpreter-glossary-mt.mjs --file glossary_insurance.json --limit 200
 *   node scripts/fill-interpreter-glossary-mt.mjs --file glossary_medical.json --dry-run --limit 10
 *
 * Target codes: maps BCP-47 tags to LibreTranslate `target` where needed (zh-CN → zh, nb → no).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");

const LANGS = [
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
    file: "glossary_insurance.json",
    limit: 500,
    dryRun: false,
    delayMs: Number(process.env.FILL_DELAY_MS ?? "350"),
  };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--file") out.file = a[++i];
    else if (a[i] === "--limit") out.limit = Number(a[++i]);
    else if (a[i] === "--dry-run") out.dryRun = true;
    else if (a[i] === "--delay-ms") out.delayMs = Number(a[++i]);
  }
  return out;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { file, limit, dryRun, delayMs } = parseArgs();
  const baseUrl = process.env.LIBRETRANSLATE_URL?.trim() || "https://libretranslate.com";
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) {
    console.error("file not found:", fp);
    process.exit(2);
  }

  const glossary = JSON.parse(fs.readFileSync(fp, "utf8"));
  const cache = new Map();
  let calls = 0;

  for (const [canonicalKey, row] of Object.entries(glossary)) {
    if (!row?.translations || typeof row.translations !== "object") continue;
    const en = (row.translations.en ?? canonicalKey).trim();
    if (!en) continue;

    for (const code of LANGS) {
      if (calls >= limit) break;
      if (!needsFillForLang(canonicalKey, row.translations, code)) continue;

      const targetLibre = TO_LIBRE[code];
      if (!targetLibre) continue;

      const cacheKey = `${en}\n${targetLibre}`;
      let translated;
      if (cache.has(cacheKey)) {
        translated = cache.get(cacheKey);
      } else {
        if (dryRun) {
          console.info("[dry-run] would translate", { en: en.slice(0, 80), target: code, targetLibre });
          translated = `[DRY-RUN:${code}]`;
        } else {
          console.info("translate", { calls, target: code, en: en.slice(0, 60) });
          translated = await translateLine(baseUrl, en, targetLibre, AbortSignal.timeout(25_000));
          await sleep(delayMs);
        }
        cache.set(cacheKey, translated);
        calls++;
      }
      row.translations[code] = translated;
    }
    if (calls >= limit) break;
  }

  if (!dryRun && calls > 0) {
    const tmp = `${fp}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(glossary), "utf8");
    fs.renameSync(tmp, fp);
    console.info("updated", fp, "apiCalls", calls);
  } else {
    console.info("no file write (dry-run or zero calls)", { calls });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
