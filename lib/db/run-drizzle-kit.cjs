#!/usr/bin/env node
/**
 * Resolves drizzle-kit from @workspace/db's dependency tree (not a guessed path).
 * Fixes MODULE_NOT_FOUND when drizzle-kit hoists bins differently than `drizzle-kit` on PATH.
 *
 * Push guard: blocks `drizzle-kit push` against remote/Railway-internal DBs unless the command
 * was started via `pnpm db:push:railway` (DRIZZLE_PUSH_FROM_RAILWAY_CLI=1), Railway env vars
 * are present (e.g. railway run / deploy), or DRIZZLE_KIT_PUSH_UNGUARDED=1.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const pkgRoot = __dirname;
const configPath = path.join(pkgRoot, "drizzle.config.cjs");

// Same sources as drizzle.config.cjs so the push guard sees DATABASE_URL from .env (not only drizzle-kit child).
try {
  const { config: loadEnv } = require("dotenv");
  const repoRoot = path.resolve(pkgRoot, "../..");
  loadEnv({ path: path.join(repoRoot, ".env") });
  loadEnv({ path: path.join(repoRoot, ".env.local") });
  loadEnv({ path: path.join(pkgRoot, ".env") });
} catch {
  /* dotenv optional at guard time */
}

/** First env keys drizzle.config uses for URL (subset; enough for guard). */
const POSTGRES_URL_GUARD_KEYS = [
  "DATABASE_URL",
  "DATABASE_PRIVATE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "PG_URL",
  "POSTGRESQL_URL",
];

function trimQuotes(s) {
  let t = String(s).replace(/^\uFEFF/, "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function firstPostgresUrlFromEnv() {
  for (const key of POSTGRES_URL_GUARD_KEYS) {
    const raw = process.env[key];
    if (raw === undefined || raw === null) continue;
    const t = trimQuotes(raw);
    if (/^postgres(ql)?:\/\//i.test(t)) return t;
  }
  return null;
}

function tryHostname(url) {
  try {
    const u = new URL(url.replace(/^postgresql:/i, "postgres:"));
    return u.hostname || "";
  } catch {
    return "";
  }
}

function isLocalPostgresHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.endsWith(".localhost")
  );
}

function isRailwayInternalHost(host) {
  if (!host) return false;
  return /\.railway\.internal$/i.test(host) || /^postgres\.railway\.internal$/i.test(host);
}

function isPushInvocation(argv) {
  return argv[0] === "push" || argv.includes("push");
}

function assertPushAllowed(url) {
  if (!url) return;

  const host = tryHostname(url);
  const local = isLocalPostgresHost(host);

  const railwayInjected = Boolean(
    process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.RAILWAY_SERVICE_ID,
  );

  const fromRailwayWrapper = process.env.DRIZZLE_PUSH_FROM_RAILWAY_CLI === "1";
  const unguarded = process.env.DRIZZLE_KIT_PUSH_UNGUARDED === "1";

  if (local) return;

  if (fromRailwayWrapper || railwayInjected || unguarded) return;

  if (isRailwayInternalHost(host)) {
    console.error(
      "[@workspace/db] Refusing drizzle-kit push: DATABASE_URL host is *.railway.internal.",
    );
    console.error(
      "  That hostname only resolves inside Railway. Run: pnpm db:push:railway (from repo root)",
    );
    console.error("  Or set DRIZZLE_KIT_PUSH_UNGUARDED=1 only if you know what you are doing.");
    process.exit(1);
  }

  console.error(
    "[@workspace/db] Refusing drizzle-kit push: remote database host " + JSON.stringify(host),
  );
  console.error(
    "  Migrations must run with Railway-injected env: pnpm db:push:railway",
  );
  console.error(
    "  Local dev: use postgresql://localhost… or set DRIZZLE_KIT_PUSH_UNGUARDED=1 to override.",
  );
  process.exit(1);
}

/** linkedKit */
const linkedKit = path.join(pkgRoot, "node_modules", "drizzle-kit");
let binPath;
try {
  const kitRoot = fs.realpathSync(linkedKit);
  binPath = path.join(kitRoot, "bin.cjs");
  if (!fs.existsSync(binPath)) throw new Error(`missing ${binPath}`);
} catch {
  console.error(
    "[@workspace/db] drizzle-kit is not installed. From the monorepo root run:\n" +
      "  pnpm install\n",
  );
  process.exit(1);
}

let passthrough = process.argv.slice(2);
if (passthrough.length === 0) {
  console.error("Usage: node run-drizzle-kit.cjs <drizzle-kit args…> e.g. `push` or `push --force`");
  process.exit(1);
}

if (isPushInvocation(passthrough)) {
  assertPushAllowed(firstPostgresUrlFromEnv());
  const noninteractive =
    process.env.DRIZZLE_PUSH_FROM_RAILWAY_CLI === "1" ||
    process.env.DRIZZLE_PUSH_NONINTERACTIVE === "1";
  if (noninteractive && !passthrough.includes("--force")) {
    passthrough = [...passthrough, "--force"];
  }
}

const child = spawnSync(
  process.execPath,
  [binPath, ...passthrough, "--config", configPath],
  { stdio: "inherit", cwd: pkgRoot, env: process.env },
);

process.exit(child.status === null ? 1 : child.status);
