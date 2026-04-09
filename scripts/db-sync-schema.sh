#!/usr/bin/env bash
# Thin wrapper: production sync must use Railway-injected DATABASE_URL (see railway-db-push.sh).
# Do not export DATABASE_URL on your laptop for production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/railway-db-push.sh"
