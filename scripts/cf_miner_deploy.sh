#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/services/cf-worker-miner"

cd "$WORKER_DIR"
echo "[cf-miner] Installing dependencies"
npm install

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "[cf-miner] Wrangler login required (browser will open)"
  npx wrangler login
fi

echo "[cf-miner] Deploying worker"
npx wrangler deploy

echo "[cf-miner] Deployment done. Verify with:"
echo "curl '<WORKER_URL>/v1/health'"
echo "curl '<WORKER_URL>/resolve?name=netflix.com&type=A'"
