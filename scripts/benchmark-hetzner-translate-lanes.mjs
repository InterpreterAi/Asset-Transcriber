#!/usr/bin/env node
/**
 * Repeat identical LibreTranslate-compatible POST /translate across CORE1–CORE4 URLs.
 *
 * Prerequisites: network route to worker bases from this machine (same as verify-hetzner-cores).
 *
 * Usage:
 *   CORE1=http://hz1:5001 CORE2=http://hz1:5002 CORE3=http://hz2:5001 CORE4=http://hz2:5002 \
 *     pnpm run benchmark:hetzner-translate-lanes -- --iterations 25
 *
 * Or pass bases positionally after --bases (comma-separated).
 */

function trimSlash(s) {
  return String(s ?? "").trim().replace(/\/+$/, "");
}

function normalizedBaseFingerprint(u) {
  let s = String(u ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const x = new URL(s);
    const port = x.port || (x.protocol === "https:" ? "443" : "80");
    return `${x.protocol}//${x.hostname}:${port}`.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function parseArgs(argv) {
  /** @type {{ iterations: number; text: string; source: string; target: string; bases: string[] }} */
  const o = {
    iterations: Number.parseInt(process.env.BENCHMARK_ITERATIONS ?? "20", 10) || 20,
    text:
      process.env.BENCHMARK_TEXT?.trim() ||
      "Parity probe: outpatient colonoscopy biopsy follow-up scheduling next Tuesday confirmed.",
    source: process.env.BENCHMARK_SOURCE?.trim() || "en",
    target: process.env.BENCHMARK_TARGET?.trim() || "es",
    bases: [],
  };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--iterations") {
      o.iterations = Math.max(1, Number.parseInt(argv[i + 1] ?? `${o.iterations}`, 10) || o.iterations);
      i += 2;
      continue;
    }
    if (a === "--text") {
      o.text = argv[i + 1] ?? o.text;
      i += 2;
      continue;
    }
    if (a === "--source") {
      o.source = argv[i + 1] ?? o.source;
      i += 2;
      continue;
    }
    if (a === "--target") {
      o.target = argv[i + 1] ?? o.target;
      i += 2;
      continue;
    }
    if (a === "--bases") {
      const raw = argv[i + 1] ?? "";
      o.bases.push(...raw.split(",").map((s) => s.trim()).filter(Boolean));
      i += 2;
      continue;
    }
    i += 1;
  }
  if (o.bases.length === 0) {
    const d1 =
      trimSlash(process.env.HETZNER_CORE1_TRANSLATE_BASE) ||
      (() => {
        const host = trimHost(process.env.HETZNER_WORKER_HOST);
        const scheme = String(process.env.HETZNER_WORKER_SCHEME ?? "http").trim();
        const root = `${scheme}://${host}`;
        return `${root}:5001`;
      })();
    const d2 =
      trimSlash(process.env.HETZNER_CORE2_TRANSLATE_BASE) ||
      (() => {
        const host = trimHost(process.env.HETZNER_WORKER_HOST);
        const scheme = String(process.env.HETZNER_WORKER_SCHEME ?? "http").trim();
        const root = `${scheme}://${host}`;
        return `${root}:5002`;
      })();
    o.bases = [d1, d2];
    const b3 = trimSlash(process.env.HETZNER_CORE3_TRANSLATE_BASE);
    const b4 = trimSlash(process.env.HETZNER_CORE4_TRANSLATE_BASE);
    if (b3 && b4) {
      o.bases.push(b3, b4);
    }
  }
  return o;
}

function trimHost(raw) {
  return String(raw ?? "178.156.211.226")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile95(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.ceil(0.95 * (n - 1)));
  return sorted[idx];
}

async function translateOnce(base, body, abortMs) {
  const url = `${trimSlash(base)}/translate`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), abortMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const elapsed = performance.now() - t0;
    const data = /** @type {Record<string, unknown>} */ (
      typeof res.headers.get === "function" &&
      String(res.headers.get("content-type") ?? "").includes("json")
        ? await res.json()
        : JSON.parse(await res.text())
    );
    const translated =
      typeof data.translatedText === "string"
        ? data.translatedText
        : typeof data.translation === "string"
          ? data.translation
          : "";
    const err = typeof data.error === "string" ? data.error : "";
    if (!res.ok) {
      return { ok: false, elapsedMs: elapsed, detail: err || `HTTP ${res.status}`, translatedLen: translated.length };
    }
    return {
      ok: true,
      elapsedMs: elapsed,
      detail: err || "",
      translatedLen: translated.trim().length,
    };
  } catch (e) {
    const elapsed = performance.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, elapsedMs: elapsed, detail: msg, translatedLen: 0 };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const cfg = parseArgs(argv);

  console.log("[benchmark] lang pair:", cfg.source, "→", cfg.target);
  console.log("[benchmark] iterations:", cfg.iterations);
  console.log("[benchmark] textLen:", cfg.text.length);

  const labels = cfg.bases.length <= 4 ? ["core1", "core2", "core3", "core4"].slice(0, cfg.bases.length) : cfg.bases.map((_, i) => `lane_${i + 1}`);

  /** @type {Map<string,string>} */
  const fpSeen = new Map();
  let dup = false;
  for (let i = 0; i < cfg.bases.length; i++) {
    const fp = normalizedBaseFingerprint(cfg.bases[i]);
    if (fpSeen.has(fp)) {
      console.error(
        `[benchmark] DUPLICATE URL fingerprints: ${labels[i]} (${cfg.bases[i]}) collapses onto same endpoint as earlier lane — parity FAIL until env fixed.`,
      );
      dup = true;
    } else {
      fpSeen.set(fp, labels[i]);
    }
  }
  if (dup) process.exitCode = 2;

  const body = { q: cfg.text, source: cfg.source, target: cfg.target, format: "text" };
  const TIMEOUT_MS = 60_000;

  console.log("");
  /** @type {Record<string,{ n: number; fail: number; p50:number;p95:number;min:number;max:number;} >} */
  const summary = {};
  for (let i = 0; i < cfg.bases.length; i++) {
    const lane = labels[i];
    const base = cfg.bases[i];
    console.log(`--- ${lane} ${base}`);
    /** @type {number[]} */
    const okMs = [];
    let fails = 0;
    for (let k = 0; k < cfg.iterations; k++) {
      const r = await translateOnce(base, body, TIMEOUT_MS);
      if (!r.ok || r.translatedLen < 1) {
        fails++;
        process.stderr.write(`  iter ${k + 1}: FAIL ${r.detail}\n`);
        continue;
      }
      okMs.push(r.elapsedMs);
      if (okMs.length <= 5 || k === cfg.iterations - 1) {
        console.log(`  iter ${k + 1}: ${r.elapsedMs.toFixed(1)} ms (out ${r.translatedLen} chars)`);
      }
    }
    okMs.sort((a, b) => a - b);
    summary[lane] = {
      n: okMs.length,
      fail: fails,
      p50: okMs.length ? median(okMs) : 0,
      p95: okMs.length ? percentile95(okMs) : 0,
      min: okMs.length ? okMs[0] : 0,
      max: okMs.length ? okMs[okMs.length - 1] : 0,
    };
    console.log(
      `${lane}: ok=${okMs.length}/${cfg.iterations} fail=${fails} p50=${summary[lane].p50.toFixed(1)}ms p95=${summary[lane].p95.toFixed(1)}ms min=${summary[lane].min.toFixed(1)}ms max=${summary[lane].max.toFixed(1)}ms\n`,
    );
    if (fails === cfg.iterations) process.exitCode = 1;
  }

  console.log("[benchmark] Done. Compare p50 across lanes — large gaps mean infra parity issue, not routing.");
}

void main();
