# Put these files on your Hetzner box as `/root/deploy/`

The API repo lives on GitHub; this folder is the **only** thing you need on the translator server to run the three LibreTranslate ports.

## Option A — from your laptop (replace `YOUR_SERVER_IP`)

```bash
scp -r deploy/for-server-root/* root@YOUR_SERVER_IP:/root/deploy/
ssh root@YOUR_SERVER_IP 'cd /root/deploy && docker compose pull && docker compose up -d'
```

## Option B — clone the repo on the server, then copy

```bash
ssh root@YOUR_SERVER_IP
mkdir -p /root/deploy /root/src && cd /root/src
git clone https://github.com/InterpreterAi/Asset-Transcriber.git
cp -a Asset-Transcriber/deploy/for-server-root/* /root/deploy/
cd /root/deploy && docker compose pull && docker compose up -d
```

## Check (on the server)

```bash
docker compose -f /root/deploy/docker-compose.yml ps
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5001/languages
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5002/languages
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5003/languages
```

Expect `200` on each line.

Then set Railway/API env `HETZNER_CORE1/2/3_TRANSLATE_BASE` to `http://<this server's public IP>:5001` etc., and redeploy the API.
