#!/usr/bin/env node
/**
 * Resolves drizzle-kit from @workspace/db's dependency tree (not a guessed path).
 * Fixes MODULE_NOT_FOUND when pnpm hoists bins differently than `drizzle-kit` on PATH.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const pkgRoot = __dirname;
const configPath = path.join(pkgRoot, "drizzle.config.cjs");

/** drizzle-kit's package.json "exports" hides bin.cjs from require.resolve — use realpath on node_modules link. */
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

const passthrough = process.argv.slice(2);
if (passthrough.length === 0) {
  console.error("Usage: node run-drizzle-kit.cjs <drizzle-kit args…> e.g. `push` or `push --force`");
  process.exit(1);
}

const child = spawnSync(
  process.execPath,
  [binPath, ...passthrough, "--config", configPath],
  { stdio: "inherit", cwd: pkgRoot, env: process.env },
);

process.exit(child.status === null ? 1 : child.status);
