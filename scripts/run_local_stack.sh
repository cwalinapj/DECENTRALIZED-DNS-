#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATEWAY_PORT="${GATEWAY_PORT:-8054}"
TLS_PROXY_PORT="${TLS_PROXY_PORT:-8443}"
GATEWAY_HOST="${GATEWAY_HOST:-127.0.0.1}"
VERIFY_NAME="${VERIFY_NAME:-netflix.com}"
TRR_URL="https://${GATEWAY_HOST}:${TLS_PROXY_PORT}/dns-query"

for dep in node npm curl jq bash; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    echo "missing dependency: $dep" >&2
    exit 2
  fi
done

GW_PID=""
TLS_PID=""

cleanup() {
  local code=$?
  if [[ -n "${TLS_PID}" ]]; then
    kill "${TLS_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${GW_PID}" ]]; then
    kill "${GW_PID}" >/dev/null 2>&1 || true
  fi
  wait >/dev/null 2>&1 || true
  exit "$code"
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"

echo "==> building gateway"
npm -C gateway run build >/tmp/ddns-local-stack-build.log 2>&1

echo "==> starting gateway on ${GATEWAY_HOST}:${GATEWAY_PORT}"
PORT="$GATEWAY_PORT" node gateway/dist/server.js >/tmp/ddns-local-stack-gateway.log 2>&1 &
GW_PID=$!
sleep 1
if ! kill -0 "$GW_PID" >/dev/null 2>&1; then
  echo "gateway process failed to start (likely port in use): ${GATEWAY_HOST}:${GATEWAY_PORT}" >&2
  echo "gateway log: /tmp/ddns-local-stack-gateway.log" >&2
  exit 1
fi

echo "==> starting local TLS proxy on ${GATEWAY_HOST}:${TLS_PROXY_PORT}"
TLS_PROXY_TARGET="http://${GATEWAY_HOST}:${GATEWAY_PORT}" \
TLS_PROXY_PORT="$TLS_PROXY_PORT" \
TLS_PROXY_HOST="$GATEWAY_HOST" \
bash "$REPO_ROOT/scripts/firefox_trr_tls_proxy.sh" >/tmp/ddns-local-stack-tls.log 2>&1 &
TLS_PID=$!
sleep 1
if ! kill -0 "$TLS_PID" >/dev/null 2>&1; then
  echo "TLS proxy failed to start: ${GATEWAY_HOST}:${TLS_PROXY_PORT}" >&2
  echo "tls proxy log: /tmp/ddns-local-stack-tls.log" >&2
  exit 1
fi

echo "==> waiting for gateway health"
for _ in $(seq 1 30); do
  if curl -fsS "http://${GATEWAY_HOST}:${GATEWAY_PORT}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://${GATEWAY_HOST}:${GATEWAY_PORT}/healthz" >/dev/null 2>&1; then
  echo "gateway failed to become healthy on ${GATEWAY_HOST}:${GATEWAY_PORT}" >&2
  echo "gateway log: /tmp/ddns-local-stack-gateway.log" >&2
  exit 1
fi

echo "==> waiting for TLS proxy"
for _ in $(seq 1 30); do
  if curl -ksS -o /dev/null -w "%{http_code}" "https://${GATEWAY_HOST}:${TLS_PROXY_PORT}/healthz" | grep -q '^200$'; then
    break
  fi
  sleep 1
done

if ! curl -ksS -o /dev/null -w "%{http_code}" "https://${GATEWAY_HOST}:${TLS_PROXY_PORT}/healthz" | grep -q '^200$'; then
  echo "TLS proxy failed to become ready: https://${GATEWAY_HOST}:${TLS_PROXY_PORT}/healthz" >&2
  echo "tls proxy log: /tmp/ddns-local-stack-tls.log" >&2
  exit 1
fi

cat <<EOT

Firefox about:config values:
  network.trr.mode = 3
  network.trr.uri = ${TRR_URL}
  network.trr.custom_uri = ${TRR_URL}
  network.trr.allow-rfc1918 = true
  network.trr.bootstrapAddr = ${GATEWAY_HOST}

TRR URL:
  ${TRR_URL}

EOT

echo "==> verifying DoH A"
bash "$REPO_ROOT/scripts/firefox_doh_verify.sh" --url "https://${GATEWAY_HOST}:${TLS_PROXY_PORT}" --name "$VERIFY_NAME" --type A --insecure

echo "==> verifying DoH AAAA"
bash "$REPO_ROOT/scripts/firefox_doh_verify.sh" --url "https://${GATEWAY_HOST}:${TLS_PROXY_PORT}" --name "$VERIFY_NAME" --type AAAA --insecure

echo "✅ LOCAL STACK READY"
echo "open https://${VERIFY_NAME} in Firefox (TRR settings above)."
echo "press Ctrl+C to stop gateway + TLS proxy"

while true; do
  sleep 3600
  if ! kill -0 "$GW_PID" >/dev/null 2>&1; then
    echo "gateway exited unexpectedly; see /tmp/ddns-local-stack-gateway.log" >&2
    exit 1
  fi
  if ! kill -0 "$TLS_PID" >/dev/null 2>&1; then
    echo "tls proxy exited unexpectedly; see /tmp/ddns-local-stack-tls.log" >&2
    exit 1
  fi
done
