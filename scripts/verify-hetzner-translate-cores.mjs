#!/usr/bin/env node
/**
 * Health-check two LibreTranslate lane URLs (GET /languages → 200).
 * Matches `hetzner-core-router.ts` two-lane defaults (5001 paid, 5002 trial).
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
  return [`${root}:5001`, `${root}:5002`];
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
    console.log("[verify-hetzner-cores] HETZNER_USE_LEGACY_SINGLE_STACK=1 — skipping two-lane check.");
    process.exit(0);
  }

  const [d1, d2] = defaults();
  const pick = (v, d) => (v != null && String(v).trim() !== "" ? String(v).trim() : d);
  const urls = [
    ["paid-lane", pick(process.env.HETZNER_CORE1_TRANSLATE_BASE, d1)],
    ["trial-lane", pick(process.env.HETZNER_CORE2_TRANSLATE_BASE, d2)],
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
    console.error(
      "[verify-hetzner-cores] One or more lanes failed. Fix Docker/workers, tighten LT_LOAD_ONLY, or set HETZNER_USE_LEGACY_SINGLE_STACK=1 temporarily.",
    );
    process.exit(1);
  }
  console.log("[verify-hetzner-cores] Both lanes responded OK.");
}

void main();
