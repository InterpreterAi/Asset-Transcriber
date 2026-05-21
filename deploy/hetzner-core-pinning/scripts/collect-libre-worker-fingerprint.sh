#!/usr/bin/env bash
# Run ON each Hetzner worker (HZ-1, HZ-2) after SSH — compare outputs across hosts.
# Usage:
#   ./collect-libre-worker-fingerprint.sh [container_name ...]
# Default container names match deploy/hetzner-core-pinning/docker-compose.core-pinning.yml
set -euo pipefail

names=("$@")
if [[ ${#names[@]} -eq 0 ]]; then
  names=(libre-paid libre-trial)
fi

echo "=== hostname / time ==="
hostname || true
date -uIs 2>/dev/null || date -u

echo "=== host memory ==="
(command -v free >/dev/null && free -h) || true

echo "=== docker version ==="
docker version --format '{{.Server.Version}}' 2>/dev/null || docker --version || true

for c in "${names[@]}"; do
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "=== SKIP (not running): $c ==="
    continue
  fi
  echo ""
  echo "========== CONTAINER: $c =========="
  img_id=$(docker inspect -f '{{.Image}}' "$c" 2>/dev/null || true)
  echo "--- RepoDigests (resolved image ${img_id:-?}) ---"
  if [[ -n "$img_id" ]]; then
    docker inspect -f '{{range .RepoDigests}}{{println .}}{{end}}' "$img_id" 2>/dev/null || true
  fi
  docker inspect "$c" --format 'Config.Image={{.Config.Image}}'
  docker inspect "$c" --format 'ImageId={{.Image}}'

  echo "--- Entrypoint.Cmd ---"
  docker inspect "$c" --format 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}'

  echo "--- Env (sorted, LT_/OMP/mem related) ---"
  docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | LC_ALL=C sort | grep -E '^(LT_|OMP_|TOKENIZERS_PARALLELISM|CUDA|MODEL|ARGOS)' || true
  docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | LC_ALL=C sort || true

  echo "--- HostConfig: Memory Cpu Cpuset Restart ---"
  docker inspect "$c" --format \
    'Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}} CpusetCpus={{json .HostConfig.CpusetCpus}} CpuQuota={{.HostConfig.CpuQuota}} CpuPeriod={{.HostConfig.CpuPeriod}} CpuShares={{.HostConfig.CpuShares}} RestartName={{.HostConfig.RestartPolicy.Name}} RestartMaxRetries={{.HostConfig.RestartPolicy.MaximumRetryCount}}'

  echo "--- Ports ---"
  docker inspect "$c" --format '{{json .HostConfig.PortBindings}}'

  echo "--- Healthcheck ---"
  docker inspect "$c" --format '{{json .Config.Healthcheck}}'

done

echo ""
echo "=== done ==="
