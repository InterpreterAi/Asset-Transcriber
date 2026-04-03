import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * Resolve Postgres URL for Railway / Docker / local.
 * - Prefer DATABASE_URL (Railway sets this when Postgres is linked to the service).
 * - Otherwise build from PG* vars (Railway Postgres template also exposes these).
 */
function resolveDatabaseUrl(): string {
  const direct =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim();
  if (direct) return direct;

  const host = process.env.PGHOST?.trim();
  const port = process.env.PGPORT?.trim() || "5432";
  const user = process.env.PGUSER?.trim();
  const password = process.env.PGPASSWORD ?? "";
  const database = process.env.PGDATABASE?.trim();

  if (host && user && database) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(password);
    let url = `postgresql://${u}:${p}@${host}:${port}/${database}`;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    const wantSsl =
      process.env.PGSSLMODE === "require" ||
      (!isLocal && Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID));
    if (wantSsl) {
      url += url.includes("?") ? "&" : "?";
      url += "sslmode=require";
    }
    return url;
  }

  throw new Error(
    "Database configuration missing. Set DATABASE_URL, or add a Postgres service on Railway and link it so DATABASE_URL is injected. " +
      "Alternatively set PGHOST, PGPORT, PGUSER, PGPASSWORD, and PGDATABASE (Railway Postgres template).",
  );
}

const connectionString = resolveDatabaseUrl();

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
