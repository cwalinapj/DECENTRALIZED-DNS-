#!/usr/bin/env bash
set -euo pipefail

# Verify a Cloudflare miner /resolve payload matches gateway quorum shape.
# Usage:
#   bash scripts/miner_cf_verify.sh --url https://<worker>.workers.dev [--name netflix.com] [--type A|AAAA]

BASE_URL=""
NAME="netflix.com"
TYPE="A"
TIMEOUT_S="${TIMEOUT_S:-15}"
INSECURE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --type)
      TYPE="${2:-}"
      shift 2
      ;;
    --insecure)
      INSECURE=1
      shift
      ;;
    -h|--help)
      echo "usage: bash scripts/miner_cf_verify.sh --url <worker_base_url> [--name netflix.com] [--type A|AAAA] [--insecure]"
      exit 0
      ;;
    *)
      echo "error: unknown arg: $1"
      echo "usage: bash scripts/miner_cf_verify.sh --url <worker_base_url> [--name netflix.com] [--type A|AAAA] [--insecure]"
      exit 2
      ;;
  esac
done

if [[ -z "${BASE_URL}" ]]; then
  echo "error: --url is required"
  echo "usage: bash scripts/miner_cf_verify.sh --url <worker_base_url> [--name netflix.com] [--type A|AAAA] [--insecure]"
  exit 2
fi

if [[ "${TYPE}" != "A" && "${TYPE}" != "AAAA" ]]; then
  echo "error: --type must be A or AAAA"
  exit 2
fi

command -v curl >/dev/null 2>&1 || { echo "error: curl is required"; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "error: jq is required"; exit 2; }

BASE_URL="${BASE_URL%/}"
name_q="$(printf '%s' "${NAME}" | jq -sRr @uri)"
RESOLVE_URL="${BASE_URL}/resolve?name=${name_q}&type=${TYPE}"

tmp_resolve="$(mktemp)"
trap 'rm -f "$tmp_resolve"' EXIT

curl_args=(-sS -m "${TIMEOUT_S}" -o "${tmp_resolve}" -w '%{http_code}')
if [[ "${INSECURE}" == "1" ]]; then
  curl_args+=(-k)
fi

resolve_status="$(curl "${curl_args[@]}" "${RESOLVE_URL}" || true)"

if [[ "${resolve_status}" != "200" ]]; then
  echo "verify: FAIL resolve status=${resolve_status} url=${RESOLVE_URL}"
  cat "${tmp_resolve}" || true
  exit 1
fi

jq -e '
  (.rrset_hash | type == "string" and length > 0) and
  (.confidence | IN("high","medium","low")) and
  (.upstreams_used | type == "array" and length > 0) and
  (.chosen_upstream | type == "object") and
  (.ttl_s | (type == "number" or type == "string"))
' "${tmp_resolve}" >/dev/null || {
  echo "verify: FAIL schema mismatch url=${RESOLVE_URL}"
  cat "${tmp_resolve}" || true
  exit 1
}

confidence="$(jq -r '.confidence' "${tmp_resolve}")"
rrset_hash="$(jq -r '.rrset_hash' "${tmp_resolve}")"
echo "✅ miner verified | confidence=${confidence} | rrset_hash=${rrset_hash}"
