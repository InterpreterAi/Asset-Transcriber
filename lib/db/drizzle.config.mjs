/**
 * Pure ESM config for drizzle-kit (avoids "require is not defined" when the CLI loads TS/CJS mix).
 * Loads .env from repo root and from lib/db so `pnpm db:push` picks up DATABASE_URL locally.
 */
import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, ".env.local") });
loadEnv({ path: path.join(__dirname, ".env") });

function resolveDatabaseUrlFromEnv() {
  const direct =
    process.env.DATABASE_URL?.trim() ||
    process.env.DATABASE_PRIVATE_URL?.trim() ||
    process.env.DATABASE_PUBLIC_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.NEON_DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim();
  if (direct) return direct;

  const host =
    process.env.PGHOST?.trim() || process.env.POSTGRES_HOST?.trim();
  const port =
    process.env.PGPORT?.trim() ||
    process.env.POSTGRES_PORT?.trim() ||
    "5432";
  const user =
    process.env.PGUSER?.trim() || process.env.POSTGRES_USER?.trim();
  const password =
    process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? "";
  const database =
    process.env.PGDATABASE?.trim() || process.env.POSTGRES_DB?.trim();

  if (host && user && database) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(password);
    let url = `postgresql://${u}:${p}@${host}:${port}/${database}`;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    const wantSsl =
      process.env.PGSSLMODE === "require" ||
      (!isLocal &&
        Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID));
    if (wantSsl) {
      url += url.includes("?") ? "&" : "?";
      url += "sslmode=require";
    }
    return url;
  }

  throw new Error(
    "Database URL not found. Set DATABASE_URL or DATABASE_PRIVATE_URL (Railway), or run from a shell where " +
      "`railway run` / `dotenv` provides them. Loaded .env from: " +
      `${path.join(repoRoot, ".env")} and ${path.join(__dirname, ".env")}`,
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrlFromEnv(),
  },
});
