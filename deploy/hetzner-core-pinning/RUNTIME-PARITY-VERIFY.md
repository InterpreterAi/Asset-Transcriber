# Hetzner HZ-1 vs HZ-2 runtime parity (Core 1/2 ↔ Core 3/4)

**Goal:** Before changing product code further, prove **Core 3/4 Libre containers are clones** of Core 1/2 (image, env, CPU/memory policy, ports). Routing is sticky in Postgres—if graphs still diverge here, fixing **routing** cannot help until metal matches.

You must run checks **on SSH to each worker**, or paste outputs into two files and `diff`. This repo cannot SSH to your infra.

---

## 0. API-side: URLs are distinct and intentional

On **Railway** (or `.env`), confirm:

```text
HETZNER_CORE1_TRANSLATE_BASE  → HZ-1 :5001
HETZNER_CORE2_TRANSLATE_BASE  → HZ-1 :5002
HETZNER_CORE3_TRANSLATE_BASE  → HZ-2 :5001
HETZNER_CORE4_TRANSLATE_BASE  → HZ-2 :5002
HETZNER_FOUR_LANE_ROUTER=1
```

Boot log **`hetzner_lane_table_module_init`** must show:

- `core3ResolvedViaCore2Fallback: false`
- `core4ResolvedViaCore2Fallback: false`
- **`CORE3_BASE`** / **`CORE4_BASE`** hostname = **HZ-2**, not HZ-1 (unless you intentionally colocate—all four on one machine)

If either fallback flag is **`true`**, empty env made the API reuse **lane 2’s URL** → **lane 3/4 are not separate workers.**

```bash
# From CI or laptop with Railway env wired:
pnpm exec node scripts/verify-hetzner-translate-cores.mjs
```

That script warns when **normalized lane bases duplicate** across lanes.

---

## 1. Exact comparison checklist (HZ-1 vs HZ-2)

Run **`deploy/hetzner-core-pinning/scripts/collect-libre-worker-fingerprint.sh`** on **each host** as root or docker group user.

| Item | HZ-1 (Core 1/2 containers) | HZ-2 (Core 3/4 containers) |
|------|---------------------------|---------------------------|
| **Docker image digest** | `./collect-libre-worker-fingerprint.sh libre-paid …` → `RepoDigests` |
| Same tag ≠ same digest—**compare Digests.** |||
| **Libre “version”** | HTTP `GET {base}/` or container logs startup line; Argos/models load spam |
| **Startup command / entrypoint** | `docker inspect -f '{{json .Config.Entrypoint}}' …` |
| **`LT_THREADS` / `LT_WORKERS` / `OMP_NUM_THREADS`** | In `inspect` **`Env`** array |
| **Memory limits** | `docker inspect … HostConfig.Memory` (bytes) ↔ `mem_limit` in Compose |
| **CPU (`cpuset-cpus`)** | `docker inspect … HostConfig.CpusetCpus` |
| **Restart policy** | `HostConfig.RestartPolicy` |
| **Exposed ports** | **5001 → 5000**, **5002 → 5000** (`Ports`/`PortBindings`), same mapping on HZ-2 |
| **Compose files** | `sha256sum` of the **same** `docker-compose*.yml` committed to prod on both—or paste `docker compose config` |
| **Health checks** | `docker inspect … Healthcheck` |
| **Loaded models (`LT_LOAD_ONLY`)** | Must be **same string** per role (paid vs trial) across hosts |
| **Swap** | `free -h` / `sysctl vm.swappiness` host-level—not container |

**Concurrency “feel”**: differences in **host RAM pressure**, **noisy neighbours**, **swap**, **NIC**, **disk** still change graphs even when `docker inspect` matches.

---

## 2. “Both server graphs moving” with one pinned session

If **cores are on two physical hosts**, the **sticky session only hits ONE host.** The idle host should stay cool unless:

- Anonymous **`POST /translate`** / tooling hits the other lanes
- Cron / healthchecks / CI hitting all ports  
- Wrong env (traffic fan-out or duplicate URLs)
- Second interpreter session elsewhere

Audit with **`HETZNER_MT_WIRE_DEBUG=1`** (brief): grep **`effectiveBaseForHttp`** per request.

---

## 3. Scripted parity: fingerprints

On HZ-1 and HZ-2 (adjust container names if different):

```bash
ssh hz1 bash -s < deploy/hetzner-core-pinning/scripts/collect-libre-worker-fingerprint.sh -- libre-paid libre-trial > /tmp/hz1-fingerprint.txt
ssh hz2 bash -s < deploy/hetzner-core-pinning/scripts/collect-libre-worker-fingerprint.sh -- libre-paid libre-trial > /tmp/hz2-fingerprint.txt
diff -u /tmp/hz1-fingerprint.txt /tmp/hz2-fingerprint.txt
```

Expect **digests**, **Env LT_***, **`Memory`**, **`Cpuset`**, **`PortBindings`** to match aside from intentional host paths.

---

## 4. Same workload on lanes 1–4 (pinned session **or** direct HTTP)

**A. Product-style (sticky pin)**  
Four runs: admin **`POST /api/admin/session/:sessionId/hetzner-core-override`** with `{ "lane": 1..4 }` between runs—or four short sessions pinned each lane **same scripted speech**, same ES↔EN pair, same duration. Collect API logs + worker `docker stats`.

**B. Faster / repeatable (recommended first)**  
From a machine that can reach **all four bases**, same Libre payload per lane:

```bash
pnpm run benchmark:hetzner-translate-lanes -- --iterations 30 \
  --text "This is parity sentence one. Medical follow-up colonoscopy biopsy."
```

Use env **`HETZNER_CORE{1..4}_TRANSLATE_BASE`** aligned with prod. Script prints **p50/p95/min/max ms** per lane and aborts if any two lanes share **identical normalized URL**.

Interpretation:

- Similar **latency** across 1–4 + **matching CPU** atop `docker stats` during run → duplication OK.
- Lanes **3–4 hotter** despite matching inspect fingerprints → investigate **HZ-2 host** (CPU quota, contention, thermal, NUMA).

---

## 5. Acceptance line

You can conclude **“Core 3/4 are true duplicates of 1/2”** only when:

1. **API boot** flags no CORE3/CORE4 URL fallback.  
2. **Fingerprint diff** negligible (digests + `LT_*` + memory + cpusets).  
3. **`benchmark:hetzner-translate-lanes`** latency spread within your chosen tolerance across **lanes 1–4** under the same host load tier.

Anything else stays an **infra** hypothesis until A–C pass.
