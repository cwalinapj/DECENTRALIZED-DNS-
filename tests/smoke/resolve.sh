#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
port=8056

cd "$root/gateway"

NODE_ENV=test LOG_LEVEL=verbose PORT="$port" node dist/server.js > /tmp/ddns-smoke.log 2>&1 &
server_pid=$!

cleanup() {
  kill "$server_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ready=0
for _ in {1..20}; do
  if ! kill -0 "$server_pid" >/dev/null 2>&1; then
    echo "gateway process exited early"
    cat /tmp/ddns-smoke.log
    exit 1
  fi
  if curl -sS "http://localhost:${port}/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done

if [ "$ready" -ne 1 ]; then
  echo "gateway did not become ready"
  cat /tmp/ddns-smoke.log
  exit 1
fi

response=$(curl -sSf "http://localhost:${port}/resolve?name=example.com" || true)
if [ -z "$response" ]; then
  echo "gateway did not return a response"
  cat /tmp/ddns-smoke.log
  exit 1
fi
export RESPONSE="$response"

node - <<"NODE"
const body = JSON.parse(process.env.RESPONSE || "{}");
if (body.name !== "example.com") process.exit(1);
if (body.network !== "icann") process.exit(1);
if (!Array.isArray(body.records) || body.records.length === 0) process.exit(1);
const hasA = body.records.some(r => r && r.type === "A");
if (!hasA) process.exit(1);
NODE
