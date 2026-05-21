# Hetzner two-lane LibreTranslate (memory-safe)

Three full LibreTranslate instances on a **4 GB** host typically **OOM** (each process can hold **~1.5–2.5 GB** RSS with all Argos models). This stack uses **two** containers only, with **`LT_LOAD_ONLY`** and **`mem_limit`**. See **`../MEMORY-BUDGET-2LANE.md`** for the arithmetic.

**Four lanes (`HETZNER_FOUR_LANE_ROUTER=1`):** CORE3/CORE4 mean **duplicate capacity**—operators should deploy the **same** Compose / `docker run` Libre profile on a **second** machine (usually again **`:5001` / `:5002`** mapped like lanes 1–2). Match image digest and env (**`LT_*`**, **`OMP_*`**, **`mem_limit`**, **`cpuset`**) across hosts; pin `libretranslate/libretranslate@sha256` if you require identical bits.

**Runtime parity playbook (fingerprints + benchmark scripts):** `RUNTIME-PARITY-VERIFY.md`

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

**AUTO (interpreter sessions):** at session open, **`hetzner_mt_assigned_lane`** is chosen once — paid fills exclusives **`1→2→3→4`**; trials prefer cores with **no exclusive paid**, scan **`2→1→3→4`**. Sticky unless admin overrides; no per-request fan-out.

Optional boot warning if CORE3/CORE4 hostnames drift: `HETZNER_EXPECT_CORE34_SECONDARY_HOSTNAME=<worker-b-ip-or-dns>`.

**Admin + outbound HTTP** always resolve the worker URL from the frozen `laneToBase` table via lane index (`getHetznerLaneBaseUrl`); per-session state stores **lane only**, so UI and `axios` cannot diverge from this process’s boot-time env.

**Temporary prod verification (verbose):** `HETZNER_ROUTER_ALLOC_DEBUG=1` — logs `hetzner_router_select_debug` on every router decision (`NUM_SLOTS`, `laneToBase`, assigned lane/base). Remove after confirming Railway env and allocation order.

**Temporary MT wire trace (very high volume):** `HETZNER_MT_WIRE_DEBUG=1` — logs `translate_mt_wire` and `translate_mt_wire_http` (before each outbound Libre POST) with `requestId`, session ids, lanes, `finalPostUrl`, `retryAttempt`, `fallbackReason`, live vs final flags. Unset after diagnosis.

**Rollback:** remove `HETZNER_FOUR_LANE_ROUTER` (or set `0`) → API uses **2-slot** reservation again.

**Single container fallback (`:5000` only):** `HETZNER_USE_LEGACY_SINGLE_STACK=1` on the API.

## API routing semantics (`hetzner-core-router.ts` + `hetzner-slot-allocator.ts`)

See `deploy/TRANSLATION-ENGINES-FULL-SNAPSHOT.md` §4. With four lanes, paid fills **`1→2→3→4`** (sequential duplicate capacity); trial idle scans **`2→1→3→4`**.

### Runtime parity checklist (lanes 1–2 vs 3–4 on metal)

Lanes 3–4 should behave **identically** to 1–2 if both hosts use the same container recipe:

| Check | Repo default (`docker-compose.core-pinning.yml`) |
|-------|--------------------------------------------------|
| Image | `libretranslate/libretranslate:latest` (pin `@sha256` on prod if required) |
| `LT_THREADS` / `LT_WORKERS` / `OMP_NUM_THREADS` | `1` / `1` / `1` |
| `LT_LOAD_ONLY` | Same ISO list on **all** workers |
| `mem_limit` | Same cap per container (`1400m` in compose) |
| CPU affinity | If you use `--cpuset-cpus`, apply the **same policy pattern** per role (paid vs trial container) on both hosts |

After API deploy, confirm **`hetzner_lane_table_module_init`** logs: empty CORE3/CORE4 env collapses lanes 3/4 onto CORE2 URL.

## Verify

```bash
for p in 5001 5002; do curl -sS -o /dev/null -w "%{http_code} :$p\n" "http://127.0.0.1:$p/languages"; done
```

Or from the repo: `pnpm verify:hetzner-cores`

## API host (main Node process) vs workers

- Prefer running the **API** on a different VM than these workers if possible.
- Optional: `API_OS_PROCESS_PRIORITY=high` on the API (see `server-entry.ts`).
- Trial **rate limits** and **Hetzner outbound concurrency** are enforced in the API code paths.
