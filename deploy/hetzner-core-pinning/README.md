# Hetzner two-lane LibreTranslate (memory-safe)

Three full LibreTranslate instances on a **4 GB** host typically **OOM** (each process can hold **~1.5–2.5 GB** RSS with all Argos models). This stack uses **two** containers only, with **`LT_LOAD_ONLY`** and **`mem_limit`**. See **`../MEMORY-BUDGET-2LANE.md`** for the arithmetic.

## Worker layout

| Port | Role | API lane |
|------|------|----------|
| 5001 | Paid machine MT | Lane **1** |
| 5002 | Trial machine MT | Lane **2** |

## Docker run (two containers, optional CPU affinity on Linux)

Add `LT_LOAD_ONLY` (comma-separated ISO codes) to shrink RAM. Example:

```bash
LOAD="en,es,fr,de,it,pt,ru,ar,zh,hi,tr,pl,nl"

docker run -d --name libre-paid --restart unless-stopped \
  --cpuset-cpus="0" -e LT_THREADS=1 -e LT_WORKERS=1 -e OMP_NUM_THREADS=1 \
  -e LT_LOAD_ONLY="$LOAD" --memory=1400m \
  -p 5001:5000 libretranslate/libretranslate:latest

docker run -d --name libre-trial --restart unless-stopped \
  --cpuset-cpus="1" -e LT_THREADS=1 -e LT_WORKERS=1 -e OMP_NUM_THREADS=1 \
  -e LT_LOAD_ONLY="$LOAD" --memory=1400m \
  -p 5002:5000 libretranslate/libretranslate:latest
```

## Compose (from repo)

```bash
docker compose -f deploy/hetzner-core-pinning/docker-compose.core-pinning.yml up -d
```

## API env (Railway / API server)

Paste from `railway.api.env.example`:

- `HETZNER_CORE1_TRANSLATE_BASE=http://<worker-a>:5001`
- `HETZNER_CORE2_TRANSLATE_BASE=http://<worker-a>:5002`

Or set `HETZNER_WORKER_HOST` + `HETZNER_WORKER_SCHEME` for the same defaults as code for CORE1/CORE2 only.

**Four lanes (second worker host):** set also:

- `HETZNER_CORE3_TRANSLATE_BASE=http://<worker-b>:5001`
- `HETZNER_CORE4_TRANSLATE_BASE=http://<worker-b>:5002`
- `HETZNER_FOUR_LANE_ROUTER=1`

**Rollback:** remove `HETZNER_FOUR_LANE_ROUTER` (or set `0`) → API uses **2-slot** reservation again.

**Single container fallback (`:5000` only):** `HETZNER_USE_LEGACY_SINGLE_STACK=1` on the API.

## API routing semantics (`hetzner-core-router.ts`)

See `deploy/TRANSLATION-ENGINES-FULL-SNAPSHOT.md` §4. Default **two** exclusive slots (lanes 1–2); with **`HETZNER_FOUR_LANE_ROUTER=1`** and CORE3/CORE4 set → **four** slots. Paid priority, trial-only-idle-slots, and overflow-paid-on-CORE1 unchanged.

## Verify

```bash
for p in 5001 5002; do curl -sS -o /dev/null -w "%{http_code} :$p\n" "http://127.0.0.1:$p/languages"; done
```

Or from the repo: `pnpm verify:hetzner-cores`

## API host (main Node process) vs workers

- Prefer running the **API** on a different VM than these workers if possible.
- Optional: `API_OS_PROCESS_PRIORITY=high` on the API (see `server-entry.ts`).
- Trial **rate limits** and **Hetzner outbound concurrency** are enforced in the API code paths.
