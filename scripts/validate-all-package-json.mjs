#!/usr/bin/env node
/**
 * Fail if any tracked package.json is invalid JSON or contains merge conflict markers.
 * Run from repo root: node scripts/validate-all-package-json.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
process.chdir(repoRoot);

const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.endsWith("package.json"));

if (tracked.length === 0) {
  console.error("No package.json files listed by git ls-files.");
  process.exit(1);
}

let errors = 0;
for (const rel of tracked) {
  const abs = path.join(repoRoot, rel);
  const raw = fs.readFileSync(abs, "utf8");
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
