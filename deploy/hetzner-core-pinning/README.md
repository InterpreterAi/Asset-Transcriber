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

## API env configuration

Set these on the API service:

- `HETZNER_CORE1_TRANSLATE_BASE=http://<host>:5001`
- `HETZNER_CORE2_TRANSLATE_BASE=http://<host>:5002`
- `HETZNER_CORE3_TRANSLATE_BASE=http://<host>:5003`

The API runtime enforces:

- Paid lock: paid machine plans own lanes 1-2.
- Borrowing: when no paid sessions are active, trial sessions round-robin across 1-3.
- Pre-emption: once a paid session starts, trial lanes on 1-2 are immediately remapped to lane 3 for subsequent requests.

