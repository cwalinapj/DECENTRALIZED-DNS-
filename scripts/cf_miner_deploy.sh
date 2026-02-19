#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT/services/cf-worker-miner"

if [[ ! -d "$WORKER_DIR" ]]; then
  echo "Missing worker directory: $WORKER_DIR" >&2
  exit 1
fi

cd "$WORKER_DIR"
echo "[miner:cf] installing dependencies..."
npm install

echo "[miner:cf] checking wrangler auth..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "[miner:cf] not logged in; starting browser login flow."
  echo "[miner:cf] You must complete Cloudflare email/CAPTCHA verification once."
  npx wrangler login
fi

echo "[miner:cf] deploying worker..."
tmp_log="$(mktemp)"
npx wrangler deploy | tee "$tmp_log"

worker_url="$(grep -Eo 'https://[^ ]+\\.workers\\.dev' "$tmp_log" | head -n 1 || true)"
rm -f "$tmp_log"

echo
if [[ -n "${worker_url}" ]]; then
  echo "[miner:cf] deployed URL: $worker_url"
  echo "curl \"$worker_url/v1/health\""
  echo "curl \"$worker_url/resolve?name=netflix.com&type=A\""
else
  echo "[miner:cf] deploy completed. Could not parse workers.dev URL from output."
  echo "Run: npx wrangler deployments list"
  echo "Then test:"
  echo "curl \"<WORKER_URL>/v1/health\""
  echo "curl \"<WORKER_URL>/resolve?name=netflix.com&type=A\""
fi
