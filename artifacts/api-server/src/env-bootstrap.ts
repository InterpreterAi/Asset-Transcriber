/**
 * Load `.env` files before any other app code. Does not override vars already set by the host
 * (Railway, Docker, etc.) — dotenv default is override: false.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const apiRoot = path.resolve(here, "..", "..");

for (const p of [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(apiRoot, ".env"),
  path.join(apiRoot, ".env.local"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.local"),
]) {
  dotenv.config({ path: p });
}
dotenv.config();
