#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://127.0.0.1:8443}"
NAME="${NAME:-netflix.com}"
QTYPE="${QTYPE:-A}"
INSECURE_TLS="${INSECURE_TLS:-1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      BASE_URL="$2"
      shift 2
      ;;
    --name)
      NAME="$2"
      shift 2
      ;;
    --type)
      QTYPE="$2"
      shift 2
      ;;
    --insecure)
      INSECURE_TLS="1"
      shift
      ;;
    --secure)
      INSECURE_TLS="0"
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      echo "usage: bash scripts/firefox_doh_verify.sh [--url <base>] [--name <domain>] [--type A|AAAA] [--insecure|--secure]" >&2
      exit 2
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 2
fi
if [[ "$QTYPE" != "A" && "$QTYPE" != "AAAA" ]]; then
  echo "--type must be A or AAAA" >&2
  exit 2
fi

DOH_ENDPOINT="${BASE_URL%/}/dns-query"
RESOLVE_ENDPOINT="${BASE_URL%/}/v1/resolve?name=$(printf '%s' "$NAME" | jq -sRr @uri)&type=${QTYPE}"

tmp_dir="$(mktemp -d)"
query_file="${tmp_dir}/query.bin"
response_file="${tmp_dir}/response.bin"
trap 'rm -rf "$tmp_dir"' EXIT

NAME="$NAME" QTYPE="$QTYPE" QUERY_FILE="$query_file" node --input-type=module <<'NODE'
import fs from "node:fs";
import dnsPacket from "./gateway/node_modules/dns-packet/index.js";
const name = process.env.NAME;
const qtype = process.env.QTYPE;
const queryFile = process.env.QUERY_FILE;

const query = dnsPacket.encode({
  type: "query",
  id: 5151,
  flags: dnsPacket.RECURSION_DESIRED,
  questions: [{ type: qtype, name, class: "IN" }]
});
fs.writeFileSync(queryFile, Buffer.from(query));
NODE

curl_args=(-sS -o "$response_file" -w "%{http_code}" -X POST "$DOH_ENDPOINT" \
  -H "content-type: application/dns-message" \
  -H "accept: application/dns-message" \
  --data-binary "@${query_file}")
if [[ "$INSECURE_TLS" == "1" ]]; then
  curl_args=(-k "${curl_args[@]}")
fi
DOH_STATUS="$(curl "${curl_args[@]}")"

if [[ "$DOH_STATUS" != "200" ]]; then
  echo "DoH verification failed: http_status=$DOH_STATUS endpoint=$DOH_ENDPOINT" >&2
  exit 1
fi

DOH_RESULT="$(RESPONSE_FILE="$response_file" EXPECT_TYPE="$QTYPE" node --input-type=module <<'NODE'
import fs from "node:fs";
import dnsPacket from "./gateway/node_modules/dns-packet/index.js";

const responseFile = process.env.RESPONSE_FILE;
const expectType = process.env.EXPECT_TYPE;
const bytes = fs.readFileSync(responseFile);
const decoded = dnsPacket.decode(bytes);
const answers = Array.isArray(decoded.answers)
  ? decoded.answers.map((a) => ({ type: a.type, data: a.data, ttl: a.ttl }))
  : [];
const filtered = answers.filter((a) => String(a.type).toUpperCase() === expectType);
console.log(JSON.stringify({
  ok: filtered.length > 0,
  rcode: Number(decoded?.flags || 0) & 0x0f,
  answers: filtered
}));
NODE
)"

DOH_OK="$(printf '%s' "$DOH_RESULT" | jq -r '.ok // false')"
if [[ "$DOH_OK" != "true" ]]; then
  echo "DoH verification failed: $DOH_RESULT" >&2
  exit 1
fi

ANSWER_LINES="$(printf '%s' "$DOH_RESULT" | jq -r '.answers[] | "\(.type):\(.data):ttl=\(.ttl)"')"
echo "DoH answers:"
echo "$ANSWER_LINES"

resolve_curl_args=(-fsS "$RESOLVE_ENDPOINT")
if [[ "$INSECURE_TLS" == "1" ]]; then
  resolve_curl_args=(-k "${resolve_curl_args[@]}")
fi
RESOLVE_JSON="$(curl "${resolve_curl_args[@]}")"
CONFIDENCE="$(printf '%s' "$RESOLVE_JSON" | jq -r '.confidence // empty')"
RRSET_HASH="$(printf '%s' "$RESOLVE_JSON" | jq -r '.rrset_hash // empty')"

if [[ -z "$CONFIDENCE" || -z "$RRSET_HASH" ]]; then
  echo "resolve payload missing confidence/rrset_hash: $RESOLVE_JSON" >&2
  exit 1
fi

echo "resolve summary: confidence=$CONFIDENCE rrset_hash=$RRSET_HASH"
echo "✅ firefox DoH verify passed"
