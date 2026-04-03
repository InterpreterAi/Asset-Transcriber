/**
 * CommonJS config for drizzle-kit. The @workspace/db package uses "type": "module";
 * an .mjs config still leads drizzle-kit to load TS schema via a path where `require`
 * is undefined. `.cjs` keeps the whole CLI + schema load chain in CommonJS.
 */
const path = require("node:path");
const { config: loadEnv } = require("dotenv");
const { defineConfig } = require("drizzle-kit");

/** Provided by Node for .cjs modules */
const repoRoot = path.resolve(__dirname, "../..");

loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, ".env.local") });
loadEnv({ path: path.join(__dirname, ".env") });

// Server resolution: DATABASE_PUBLIC_URL is for browsers only (Railway) — not for Drizzle / pool.
const POSTGRES_URL_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_PRIVATE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "PG_URL",
  "POSTGRESQL_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "SUPABASE_DB_URL",
  "PGDATABASE",
];

const POSTGRES_URL_ENV_KEYS_CLIENT_ONLY = ["DATABASE_PUBLIC_URL"];

const POSTGRES_URL_ENV_KEY_SET = new Set([
  ...POSTGRES_URL_ENV_KEYS,
  ...POSTGRES_URL_ENV_KEYS_CLIENT_ONLY,
]);

function normalizeEnvConnectionString(raw) {
  if (raw === undefined || raw === null) return "";
  let t = String(raw).replace(/^\uFEFF/, "").trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function parsePostgresConnectionStringFromEnvValue(raw) {
  const t = normalizeEnvConnectionString(raw);
  if (!t) return undefined;
  const lower = t.toLowerCase();
  const idxPgsql = lower.indexOf("postgresql://");
  const idxPg = lower.indexOf("postgres://");
  let start = -1;
  if (idxPgsql >= 0 && idxPg >= 0) start = Math.min(idxPgsql, idxPg);
  else start = idxPgsql >= 0 ? idxPgsql : idxPg;
  if (start < 0) return undefined;
  let rest = t.slice(start).trim();
  rest = rest.replace(/[`'")\];,\s]+$/g, "").trim();
  if (/\$\{[^}]+\}/.test(rest)) return undefined;
  if (!/^postgres(ql)?:\/\//i.test(rest)) return undefined;
  return rest;
}

function envKeyScoreForPostgresUrl(key) {
  const u = key.toUpperCase();
  if (u === "DATABASE_URL") return 100;
  if (u === "DATABASE_PRIVATE_URL") return 99;
  if (u === "DATABASE_URL_UNPOOLED") return 97;
  if (u.includes("DATABASE") && u.includes("URL")) return 80;
  if (u === "POSTGRES_URL" || u === "POSTGRESQL_URL" || u === "PG_URL") return 75;
  if (u.includes("POSTGRES") && u.includes("URL")) return 70;
  if (u.includes("SUPABASE") && u.includes("URL")) return 65;
  if (u.includes("NEON") && u.includes("URL")) return 65;
  if (u.includes("DATABASE")) return 40;
  if (u.includes("POSTGRES") || u.startsWith("PG")) return 30;
  return 5;
}

function findPostgresUrlViaEnvSweep() {
  const candidates = [];
  for (const [key, raw] of Object.entries(process.env)) {
    if (raw === undefined) continue;
    if (POSTGRES_URL_ENV_KEY_SET.has(key)) continue;
    const value = parsePostgresConnectionStringFromEnvValue(raw);
    if (!value) continue;
    candidates.push({ value, score: envKeyScoreForPostgresUrl(key) });
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].value;
}

function resolveDatabaseUrlFromEnv() {
  for (const key of POSTGRES_URL_ENV_KEYS) {
    const url = parsePostgresConnectionStringFromEnvValue(process.env[key]);
    if (url) return url;
  }
  const swept = findPostgresUrlViaEnvSweep();
  if (swept) return swept;

  const host =
    normalizeEnvConnectionString(process.env.PGHOST) ||
    normalizeEnvConnectionString(process.env.POSTGRES_HOST);
  const port =
    normalizeEnvConnectionString(process.env.PGPORT) ||
    normalizeEnvConnectionString(process.env.POSTGRES_PORT) ||
    "5432";
  const user =
    normalizeEnvConnectionString(process.env.PGUSER) ||
    normalizeEnvConnectionString(process.env.POSTGRES_USER);
  const password =
    process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? "";
  const database =
    normalizeEnvConnectionString(process.env.PGDATABASE) ||
    normalizeEnvConnectionString(process.env.POSTGRES_DB);

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
    "Database URL not found. Set DATABASE_URL or DATABASE_PRIVATE_URL (Railway), or run via `railway run`. " +
      "Tried loading .env from repo root and lib/db.",
  );
}

module.exports = defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrlFromEnv(),
  },
});
