# Hetzner Physical Core Pinning

This deployment pins three LibreTranslate workers to dedicated CPU cores using Docker `cpuset-cpus`.

## Worker layout

- Core 1 worker -> `http://<host>:5001`
- Core 2 worker -> `http://<host>:5002`
- Core 3 worker -> `http://<host>:5003`

## Docker run (explicit cpuset-cpus)

```bash
docker run -d --name libre-core-1 --restart unless-stopped \
  --cpuset-cpus="0" -e LT_THREADS=1 -e LT_WORKERS=1 -e OMP_NUM_THREADS=1 \
  -p 5001:5000 libretranslate/libretranslate:latest

docker run -d --name libre-core-2 --restart unless-stopped \
  --cpuset-cpus="1" -e LT_THREADS=1 -e LT_WORKERS=1 -e OMP_NUM_THREADS=1 \
  -p 5002:5000 libretranslate/libretranslate:latest

docker run -d --name libre-core-3 --restart unless-stopped \
  --cpuset-cpus="2" -e LT_THREADS=1 -e LT_WORKERS=1 -e OMP_NUM_THREADS=1 \
  -p 5003:5000 libretranslate/libretranslate:latest
```

## API env configuration (three-lane isolation — default)

The API **defaults** to three distinct bases: `http://<HETZNER_WORKER_HOST>:5001` … `:5003` (host defaults to `178.156.211.226`). Paid machine sessions prefer **lanes 1–2**; when any paid session is active, **trials are forced to lane 3** (see `hetzner-core-router.ts`).

On **Railway** (or any API host): paste the variables from `railway.api.env.example` — at minimum either:

- `HETZNER_WORKER_HOST` + `HETZNER_WORKER_SCHEME`, or  
- explicit `HETZNER_CORE1_TRANSLATE_BASE`, `HETZNER_CORE2_TRANSLATE_BASE`, `HETZNER_CORE3_TRANSLATE_BASE`

**Emergency only** (one bottleneck on purpose): set `HETZNER_USE_LEGACY_SINGLE_STACK=1` so every lane uses `HETZNER_TRANSLATE_LEGACY_BASE` (default `:5000`). Unset when the three workers are healthy again.

### If you are not running `curl` yourself

1. Copy **`deploy/for-server-root/`** to the server as **`/root/deploy/`** (see `deploy/for-server-root/INSTALL.md`), then `docker compose pull && docker compose up -d` in that folder.
2. Paste Railway/API env vars from `railway.api.env.example` and **redeploy the API**.
3. For a green **GitHub Actions** check: copy `deploy/github-actions/*.yml` into `.github/workflows/` (see `deploy/github-actions/README.md` if `git push` was blocked for missing `workflow` scope), then **Actions → Verify Hetzner translate cores → Run workflow**. Or run `pnpm verify:hetzner-cores` locally against reachable URLs.

## Start pinned workers (same host as the ports)

From the repo root (Docker required):

```bash
docker compose -f deploy/hetzner-core-pinning/docker-compose.core-pinning.yml up -d
```

Verify on **that host** (not from the API-only Railway container unless it shares network):

```bash
for p in 5001 5002 5003; do curl -sS -o /dev/null -w "%{http_code} :$p\n" "http://127.0.0.1:$p/languages" || echo "fail :$p"; done
```

Expect `200` lines if LibreTranslate is healthy (`/languages` is a light GET).

The API runtime enforces:

- Paid lock: paid machine plans own lanes 1-2.
- Borrowing: when no paid sessions are active, trial sessions round-robin across 1-3.
- Pre-emption: once a paid session starts, trial lanes on 1-2 are immediately remapped to lane 3 for subsequent requests.

## API host (main Node process) vs workers

- **CPU isolation:** Run the API on a **different physical core** than LibreTranslate workers (see `cpuset-cpus` above). The API never runs MT itself; it still parses JSON, awaits workers, and holds open HTTP/WebSocket-adjacent state — under trial floods the event loop can lag paid `/translate` if everything shares one busy core.
- **Nice / priority (optional):** On the API service set `API_OS_PROCESS_PRIORITY=high` and optionally `API_OS_NICE=-8` (range -20…19 on Linux; lower = higher priority). Requires a platform that supports `os.setPriority` without extra caps.
- **Runtime limits (code):** Trial accounts get stricter `/transcription/translate` + `/transcription/token` rate limits, and outbound Hetzner calls for `trial-libre` are capped at **2** in flight (`TRIAL_HETZNER_MAX_CONCURRENT`). Tune with env vars on deploy.
- **WebSockets:** Browser audio uses **Soniox** WebSockets directly, not Socket.io through this API — there is no second WS tier here to reorder; protecting the API process and rate limits is what keeps token + translate responsive for paid users.

