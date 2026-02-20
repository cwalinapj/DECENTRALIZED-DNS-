#!/usr/bin/env bash
set -euo pipefail

# Verify a Cloudflare miner /resolve payload matches gateway quorum shape.
# Usage:
#   bash scripts/miner_cf_verify.sh <worker_base_url>
#   MINER_URL=https://<worker>.workers.dev bash scripts/miner_cf_verify.sh

BASE_URL="${1:-${MINER_URL:-}}"
NAME="${NAME:-netflix.com}"
TYPE="${TYPE:-A}"
TIMEOUT_S="${TIMEOUT_S:-15}"

if [[ -z "${BASE_URL}" ]]; then
  echo "usage: MINER_URL=https://<worker>.workers.dev bash scripts/miner_cf_verify.sh"
  echo "   or: bash scripts/miner_cf_verify.sh https://<worker>.workers.dev"
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required for JSON validation"
  exit 2
fi

BASE_URL="${BASE_URL%/}"
HEALTH_URL="${BASE_URL}/v1/health"
RESOLVE_URL="${BASE_URL}/resolve?name=${NAME}&type=${TYPE}"

tmp_health="$(mktemp)"
tmp_resolve="$(mktemp)"
trap 'rm -f "$tmp_health" "$tmp_resolve"' EXIT

health_status="$(curl -sS -m "${TIMEOUT_S}" -o "${tmp_health}" -w '%{http_code}' "${HEALTH_URL}" || true)"
resolve_status="$(curl -sS -m "${TIMEOUT_S}" -o "${tmp_resolve}" -w '%{http_code}' "${RESOLVE_URL}" || true)"

if [[ "${health_status}" != "200" ]]; then
  echo "verify: FAIL health status=${health_status} url=${HEALTH_URL}"
  cat "${tmp_health}" || true
  exit 1
fi

if [[ "${resolve_status}" != "200" ]]; then
  echo "verify: FAIL resolve status=${resolve_status} url=${RESOLVE_URL}"
  cat "${tmp_resolve}" || true
  exit 1
fi

jq -e '
  (.name | type == "string") and
  (.type | type == "string") and
  (.confidence | type == "string") and
  (.rrset_hash | type == "string" and length > 0) and
  (.upstreams_used | type == "array" and length > 0)
' "${tmp_resolve}" >/dev/null

confidence="$(jq -r '.confidence' "${tmp_resolve}")"
rrset_hash="$(jq -r '.rrset_hash' "${tmp_resolve}")"
upstream_count="$(jq -r '.upstreams_used | length' "${tmp_resolve}")"

echo "verify: PASS"
echo "health_url: ${HEALTH_URL}"
echo "resolve_url: ${RESOLVE_URL}"
echo "confidence: ${confidence}"
echo "rrset_hash: ${rrset_hash}"
echo "upstreams_used_count: ${upstream_count}"
