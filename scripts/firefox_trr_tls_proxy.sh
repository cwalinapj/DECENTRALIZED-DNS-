#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${REPO_ROOT}/gateway/.cache/firefox-trr"
CERT_FILE="${TLS_PROXY_CERT_FILE:-${CACHE_DIR}/localhost.crt}"
KEY_FILE="${TLS_PROXY_KEY_FILE:-${CACHE_DIR}/localhost.key}"
HOST="${TLS_PROXY_HOST:-127.0.0.1}"
PORT="${TLS_PROXY_PORT:-8443}"
TARGET="${TLS_PROXY_TARGET:-http://127.0.0.1:8054}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required for local TLS certificate generation" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 2
fi

mkdir -p "$CACHE_DIR"

if [[ ! -f "$CERT_FILE" || ! -f "$KEY_FILE" ]]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
    -subj "/CN=127.0.0.1" \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days 7 \
    -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
fi

echo "tls_proxy_cert: $CERT_FILE"
echo "tls_proxy_key: $KEY_FILE"
echo "tls_proxy_url: https://${HOST}:${PORT}/dns-query"
echo "tls_proxy_target: $TARGET"

TLS_PROXY_CERT_FILE="$CERT_FILE" \
TLS_PROXY_KEY_FILE="$KEY_FILE" \
TLS_PROXY_HOST="$HOST" \
TLS_PROXY_PORT="$PORT" \
TLS_PROXY_TARGET="$TARGET" \
node "$REPO_ROOT/scripts/firefox_trr_tls_proxy.mjs"

