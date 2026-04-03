/**
 * Load repo-root `.env` / `.env.local` in development so `pnpm dev` picks up SONIOX_API_KEY, DATABASE_URL, etc.
 * No-op in production (Railway injects env vars).
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV !== "production") {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..", "..", "..");
  config({ path: path.join(repoRoot, ".env") });
  config({ path: path.join(repoRoot, ".env.local") });
  config({ path: path.join(path.resolve(here, "..", ".."), ".env") });
}
