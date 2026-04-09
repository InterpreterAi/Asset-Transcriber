#!/usr/bin/env bash
# Production schema sync: Drizzle push with Railway-injected DATABASE_URL (command runs on your
# machine; DB URL comes from the linked Railway service, not laptop exports).
#
# Prerequisites: railway CLI, `railway link`, API service selected: `railway service`
#
# After a successful push, redeploys the linked service (skip with SKIP_RAILWAY_REDEPLOY=1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

unset DATABASE_URL DATABASE_PRIVATE_URL DATABASE_URL_UNPOOLED POSTGRES_URL PG_URL POSTGRESQL_URL || true
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE POSTGRES_HOST POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB || true

echo ">>> Cleared local Postgres env overrides (DATABASE_URL must not come from your laptop)."
echo ">>> Using Railway service variables via: railway run"
echo ">>> Linked service should be your API (web). Check with: railway service"

# Inner bash gets Railway-injected DATABASE_URL; exports satisfy run-drizzle-kit remote-host guard + --force.
railway run bash -lc "export DRIZZLE_PUSH_FROM_RAILWAY_CLI=1 DRIZZLE_PUSH_NONINTERACTIVE=1; cd \"$ROOT\" && pnpm db:push:force"

if [[ "${SKIP_RAILWAY_REDEPLOY:-}" == "1" ]]; then
  echo ">>> SKIP_RAILWAY_REDEPLOY=1 — not redeploying."
  exit 0
fi

echo ">>> Redeploying linked Railway service (API)…"
railway redeploy -y

echo ">>> Done. Check /api/healthz or /health, then load the site."
