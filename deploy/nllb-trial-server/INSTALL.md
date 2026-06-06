# trial-hetzner NLLB install (4 GB Hetzner, zero extra cost)

Replaces **LibreTranslate trial** (`libre-trial` on `:5002`) with **NLLB-600M** for `trial-hetzner` only.
Paid `basic-libre` stays on `libre-paid` `:5001`.

## Honest expectations

- NLLB-600M on CPU is **better than Argos** for medical EN→AR / EN→ES, but **not equal to OpenAI GPT-4o-mini**.
- If output is still unacceptable after deploy, temporarily route paid users to `trial-openai` until you can afford 8 GB RAM (NLLB-1.3B) or a GPU box.

## 1. Add swap (required on 4 GB)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

## 2. Stop Libre trial worker

```bash
cd /root/deploy   # or your server deploy root
docker compose stop libre-trial
docker compose rm -f libre-trial
```

Keep `libre-paid` running on `:5001`.

## 3. Build and start NLLB trial worker

Copy this folder to the server (e.g. `/root/deploy/nllb-trial-server/`), then:

```bash
cd /root/deploy/nllb-trial-server
docker compose build --no-cache
docker compose up -d
docker compose logs -f nllb-trial
```

First boot downloads ~2.4 GB model weights — allow 10–20 minutes on a slow link.

## 4. Smoke test

```bash
curl -s http://127.0.0.1:5002/health
curl -s -X POST http://127.0.0.1:5002/translate \
  -H 'Content-Type: application/json' \
  -d '{"q":"Good morning Mr. Rodriguez. His hemoglobin A1c is 9.4 percent.","source":"en","target":"ar"}'
```

## 5. Point Railway API at NLLB (trial-hetzner only)

On the **API** service (Railway), set:

```env
TRIAL_HETZNER_NLLB_BASE=http://178.156.211.226:5002
TRIAL_HETZNER_MAX_CONCURRENT=1
```

Redeploy the API. `basic-libre` is unchanged (`HETZNER_CORE1_TRANSLATE_BASE` → `:5001` Libre).

## Rollback

```bash
docker compose -f /root/deploy/nllb-trial-server/docker-compose.yml down
cd /root/deploy && docker compose up -d libre-trial
```

Unset `TRIAL_HETZNER_NLLB_BASE` on Railway.
