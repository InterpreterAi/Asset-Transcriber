/**
 * Load `.env` files before any other app code. Does not override vars already set by the host
 * (Railway, Docker, etc.) — dotenv default is override: false.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const apiRoot = path.resolve(here, "..", "..");

function parentDirs(start: string): string[] {
  const out: string[] = [];
  let cur = path.resolve(start);
  while (true) {
    out.push(cur);
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  return out;
}

const candidateFiles: string[] = [];
const pushFile = (p: string) => {
  if (!candidateFiles.includes(p)) candidateFiles.push(p);
};

for (const d of [repoRoot, apiRoot, process.cwd(), ...parentDirs(process.cwd()), ...parentDirs(here)]) {
  pushFile(path.join(d, ".env"));
  pushFile(path.join(d, ".env.local"));
}

for (const p of candidateFiles) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}
dotenv.config();

// Convenience fallback: allow a root .env alias if RESEND_API_KEY is absent.
if (!process.env.RESEND_API_KEY?.trim()) {
  const alias = process.env.RESEND_KEY?.trim() || process.env.RESEND_TOKEN?.trim();
  if (alias) process.env.RESEND_API_KEY = alias;
}
