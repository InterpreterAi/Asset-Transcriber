# Memory budget: two LibreTranslate lanes on ~4 GB RAM

## Why three instances OOM’d

LibreTranslate loads **Argos** translation models into RAM. With the default image (many language pairs), a **single** process commonly reaches **roughly 1.5–2.5 GB resident** after warm-up depending on version and how many pairs are pulled. Three such processes on a **4 GB** VPS exceed physical RAM; the Linux OOM killer stops containers first (often seconds after start).

This is order-of-magnitude physics, not tuning noise: **3 × ~2 GB >> 4 GB**.

## Two-lane + `LT_LOAD_ONLY` + `mem_limit`

We run **two** instances only:

| Lane | Role | Default port |
|------|------|----------------|
| 1 | Paid machine MT | 5001 |
| 2 | Trial machine MT | 5002 |

Each service sets **`LT_LOAD_ONLY`** to a **fixed list of ISO 639-1 codes** (interpreter-heavy set). That avoids loading dozens of Argos packs and typically drops per-process RSS into the **hundreds of MB to ~1 GB** range (still workload-dependent).

Docker **`mem_limit`** (see `deploy/for-server-root/docker-compose.yml`) caps each container so one runaway translator cannot take the whole host. Values are chosen so **two caps + ~0.7–1.0 GB** remains for the OS, Docker, SSH, and spikes on a **4 GB** box:

- **2 × 1400 MiB ≈ 2.73 GiB** hard ceiling for the pair of MT containers  
- **~1.0–1.3 GiB** left for OS + metadata (tight but workable on 4 GB; upgrade RAM or drop languages further if you still see OOM)

## Tuning

- **Tighter RAM:** shorten `LT_LOAD_ONLY` (fewer codes) or lower `mem_limit` (e.g. `1200m`).  
- **More languages:** add codes to `LT_LOAD_ONLY` and **raise** `mem_limit` or **move to a larger VM** — you cannot add languages for free in RAM.  
- **Single container again:** set `HETZNER_USE_LEGACY_SINGLE_STACK=1` on the API and run only `:5000`.
