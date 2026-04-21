#!/usr/bin/env node
/**
 * Health-check the three LibreTranslate lane URLs (GET /languages → 200).
 * Uses the same defaults as `hetzner-core-router.ts` unless env overrides.
 *
 * Usage (on the worker host, or anywhere that can reach the ports):
 *   node scripts/verify-hetzner-translate-cores.mjs
 *
 * Or set explicit bases:
 *   HETZNER_CORE1_TRANSLATE_BASE=... HETZNER_CORE2_TRANSLATE_BASE=... HETZNER_CORE3_TRANSLATE_BASE=... node ...
 */

function trimHost(raw) {
  return String(raw ?? "178.156.211.226")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function defaults() {
  const host = trimHost(process.env.HETZNER_WORKER_HOST);
  const scheme = String(process.env.HETZNER_WORKER_SCHEME ?? "http")
    .trim()
    .replace(/:+$/, "");
  const root = `${scheme}://${host}`;
  return [`${root}:5001`, `${root}:5002`, `${root}:5003`];
}

async function checkOne(name, base) {
  const url = `${base.replace(/\/$/, "")}/languages`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(url, { method: "GET", signal: ac.signal });
    if (!res.ok) {
      return { name, url, ok: false, detail: `HTTP ${res.status}` };
    }
    return { name, url, ok: true, detail: "200" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name, url, ok: false, detail: msg };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  if (process.env.HETZNER_USE_LEGACY_SINGLE_STACK === "1") {
    console.log("[verify-hetzner-cores] HETZNER_USE_LEGACY_SINGLE_STACK=1 — skipping three-core check.");
    process.exit(0);
  }

  const [d1, d2, d3] = defaults();
  const pick = (v, d) => (v != null && String(v).trim() !== "" ? String(v).trim() : d);
  const urls = [
    ["core1", pick(process.env.HETZNER_CORE1_TRANSLATE_BASE, d1)],
    ["core2", pick(process.env.HETZNER_CORE2_TRANSLATE_BASE, d2)],
    ["core3", pick(process.env.HETZNER_CORE3_TRANSLATE_BASE, d3)],
  ];

  console.log("[verify-hetzner-cores] Checking /languages on each lane…");
  const results = await Promise.all(urls.map(([n, b]) => checkOne(n, b)));
  let failed = false;
  for (const r of results) {
    const line = r.ok ? `OK   ${r.name} ${r.url}` : `FAIL ${r.name} ${r.url} — ${r.detail}`;
    console.log(line);
    if (!r.ok) failed = true;
  }
  if (failed) {
    console.error("[verify-hetzner-cores] One or more cores failed. Fix Docker/workers or set HETZNER_USE_LEGACY_SINGLE_STACK=1 temporarily.");
    process.exit(1);
  }
  console.log("[verify-hetzner-cores] All three lanes responded OK.");
}

void main();
