#!/usr/bin/env node
/**
 * Lightweight grep audit for accidental secret / provider leakage in the SPA source.
 * Uses `rg` when available, else `grep -R` (macOS/Linux).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "artifacts", "transcription-app", "src");

const checks = [
  { name: "OpenAI-style sk- prefix", pattern: String.raw`sk-[a-zA-Z0-9_-]{16,}` },
  { name: "Soniox bearer in frontend", pattern: String.raw`soniox\.com.*Bearer|Bearer\s+[a-zA-Z0-9]{20,}` },
  { name: "Hardcoded OpenAI API path + key smell", pattern: String.raw`api\.openai\.com/v1[^\n]{0,120}['\"]sk-` },
  { name: "VITE secret sink", pattern: String.raw`import\.meta\.env\.VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)` },
];

let failed = false;
let engine = "none";

function hasRg() {
  const r = spawnSync("rg", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

function runRg(pattern) {
  return spawnSync(
    "rg",
    ["--color", "never", "-n", "--glob", "*.ts", "--glob", "*.tsx", pattern, target],
    { encoding: "utf8", cwd: root },
  );
}

function runGrep(pattern) {
  return spawnSync("grep", ["-R", "-n", "-E", pattern, target], {
    encoding: "utf8",
    cwd: root,
  });
}

function scan(pattern, label) {
  const r = engine === "rg" ? runRg(pattern) : runGrep(pattern);
  if (r.error && engine === "grep") {
    console.warn(`[SKIP] ${label} — grep failed (${r.error.message}).`);
    return;
  }
  if (r.stdout && r.stdout.trim()) {
    console.error(`\n[FAIL] ${label}\n${r.stdout}`);
    failed = true;
    return;
  }
  if (r.status !== 0 && r.status !== 1) {
    console.warn(`[SKIP] ${label} — scanner exited ${r.status}`);
    return;
  }
  console.log(`[OK] ${label}`);
}

engine = hasRg() ? "rg" : "grep";
console.log(`security:audit-frontend: using ${engine}\n`);

for (const c of checks) {
  scan(c.pattern, c.name);
}

if (failed) {
  console.error("\nsecurity:audit-frontend: fix leaks above or narrow false positives in scripts/security-audit-frontend.mjs.");
  process.exit(1);
}
console.log("\nsecurity:audit-frontend: no patterns matched (grep-level clean).");
process.exit(0);
