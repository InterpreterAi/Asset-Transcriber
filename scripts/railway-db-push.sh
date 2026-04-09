#!/usr/bin/env bash
# Run Drizzle schema sync using ONLY Railway-injected database env (production-safe).
#
# Prerequisites:
#   - railway CLI installed and logged in (`railway login`)
#   - `railway link` from this repo to the correct Railway project
#   - Select the API service that owns production DATABASE_URL:
#       railway service   # pick the web/API service, not Postgres-only
#
# Why unset? A laptop export of DATABASE_URL (especially postgres.railway.internal
# or a stale URL) will break pushes or target the wrong host. Railway injects the right URL.
#
# Uses push --force so drizzle-kit does not stop for interactive rename prompts
# (e.g. referrals). Take a DB snapshot/backup in Railway before running if unsure.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

unset DATABASE_URL DATABASE_PRIVATE_URL DATABASE_URL_UNPOOLED POSTGRES_URL PG_URL POSTGRESQL_URL || true
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE POSTGRES_HOST POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB || true

echo ">>> Cleared local DB env overrides. Using variables from: railway run"
echo ">>> If the wrong service is linked, run: railway service"
railway run pnpm db:push:force
