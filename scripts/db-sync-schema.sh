#!/usr/bin/env bash
# Apply the repo's Drizzle schema to the Postgres instance your API uses.
#
# Production (recommended): do NOT paste DATABASE_URL on your Mac (internal hostnames
# like postgres.railway.internal only work inside Railway). Use:
#   pnpm db:push:railway
#
# Or from the monorepo root with Railway injecting env:
#   unset DATABASE_URL DATABASE_PRIVATE_URL
#   railway run pnpm db:push:force
#
# Legacy: run from the monorepo root with the SAME connection string as production API:
#   railway run ./scripts/db-sync-schema.sh
#
# Local (paste private URL from Railway Postgres → Connect):
#   export DATABASE_URL='postgresql://...'
#   ./scripts/db-sync-schema.sh
#
# Uses push --force so Drizzle does not block on prompts (may apply destructive
# changes if the schema ever shrinks — review drizzle-kit output if unsure).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -n "${DATABASE_PRIVATE_URL:-}" ]]; then
    export DATABASE_URL="$DATABASE_PRIVATE_URL"
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Missing DATABASE_URL. Use: railway run ./scripts/db-sync-schema.sh" >&2
  echo "Or: export DATABASE_URL='postgresql://…' (same URL the API service uses)." >&2
  exit 1
fi

pnpm db:push:force
