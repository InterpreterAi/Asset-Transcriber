#!/usr/bin/env node
/**
 * Fail if any workspace package.json is invalid JSON or contains merge conflict markers.
 * Uses git when available; otherwise walks the repo (Railway/Nixpacks may omit .git).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
process.chdir(repoRoot);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".pnpm-store",
  ".local",
  "coverage",
  ".cache",
]);

function walkPackageJsonFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkPackageJsonFiles(p, acc);
    else if (e.name === "package.json") acc.push(path.relative(repoRoot, p));
  }
  return acc;
}

function listTrackedPackageJson() {
  try {
    return execSync("git ls-files", { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith("package.json"));
  } catch {
    return [];
  }
}

let files = listTrackedPackageJson();
if (files.length === 0) {
  files = walkPackageJsonFiles(repoRoot).sort();
}

if (files.length === 0) {
  console.error("No package.json files found.");
  process.exit(1);
}

let errors = 0;
for (const rel of files) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    console.error(`MISSING: ${rel}`);
    errors++;
    continue;
  }
  let raw = fs.readFileSync(abs, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  if (/^<<<<<<< /m.test(raw) || /^>>>>>>> /m.test(raw)) {
    console.error(`CONFLICT MARKERS: ${rel}`);
    errors++;
    continue;
  }
  try {
    JSON.parse(raw);
    console.log(`OK ${rel}`);
  } catch (e) {
    console.error(`INVALID JSON ${rel}: ${e.message}`);
    errors++;
  }
}

process.exit(errors ? 1 : 0);
