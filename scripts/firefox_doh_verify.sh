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
query_b64_file="${tmp_dir}/query.b64"
response_post_file="${tmp_dir}/response_post.bin"
response_get_file="${tmp_dir}/response_get.bin"
headers_post_file="${tmp_dir}/headers_post.txt"
headers_get_file="${tmp_dir}/headers_get.txt"
trap 'rm -rf "$tmp_dir"' EXIT

NAME="$NAME" QTYPE="$QTYPE" QUERY_FILE="$query_file" QUERY_B64_FILE="$query_b64_file" node --input-type=module <<'NODE'
import fs from "node:fs";
import dnsPacket from "./gateway/node_modules/dns-packet/index.js";
const name = process.env.NAME;
const qtype = process.env.QTYPE;
const queryFile = process.env.QUERY_FILE;
const queryB64File = process.env.QUERY_B64_FILE;

const query = dnsPacket.encode({
  type: "query",
  id: 5151,
  flags: dnsPacket.RECURSION_DESIRED,
  questions: [{ type: qtype, name, class: "IN" }]
});
const queryBytes = Buffer.from(query);
fs.writeFileSync(queryFile, queryBytes);
fs.writeFileSync(queryB64File, queryBytes.toString("base64url"));
NODE

query_b64="$(cat "$query_b64_file")"

curl_post_args=(-sS -D "$headers_post_file" -o "$response_post_file" -w "%{http_code}" -X POST "$DOH_ENDPOINT" \
  -H "content-type: application/dns-message" \
  -H "accept: application/dns-message" \
  --data-binary "@${query_file}")
if [[ "$INSECURE_TLS" == "1" ]]; then
  curl_post_args=(-k "${curl_post_args[@]}")
fi
DOH_POST_STATUS="$(curl "${curl_post_args[@]}")"
if [[ "$DOH_POST_STATUS" != "200" ]]; then
  echo "DoH POST verification failed: http_status=$DOH_POST_STATUS endpoint=$DOH_ENDPOINT" >&2
  exit 1
fi

curl_get_args=(-sS -D "$headers_get_file" -o "$response_get_file" -w "%{http_code}" \
  "${DOH_ENDPOINT}?dns=${query_b64}" \
  -H "accept: application/dns-message")
if [[ "$INSECURE_TLS" == "1" ]]; then
  curl_get_args=(-k "${curl_get_args[@]}")
fi
DOH_GET_STATUS="$(curl "${curl_get_args[@]}")"
if [[ "$DOH_GET_STATUS" != "200" ]]; then
  echo "DoH GET verification failed: http_status=$DOH_GET_STATUS endpoint=${DOH_ENDPOINT}?dns=..." >&2
  exit 1
fi

post_ct="$(tr -d '\r' < "$headers_post_file" | awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' | tail -n 1)"
get_ct="$(tr -d '\r' < "$headers_get_file" | awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' | tail -n 1)"
if [[ "$post_ct" != *"application/dns-message"* ]]; then
  echo "DoH POST content-type invalid: '$post_ct'" >&2
  exit 1
fi
if [[ "$get_ct" != *"application/dns-message"* ]]; then
  echo "DoH GET content-type invalid: '$get_ct'" >&2
  exit 1
fi

parse_wire() {
  local response_file="$1"
  RESPONSE_FILE="$response_file" EXPECT_TYPE="$QTYPE" node --input-type=module <<'NODE'
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
}

DOH_POST_RESULT="$(parse_wire "$response_post_file")"
DOH_GET_RESULT="$(parse_wire "$response_get_file")"

POST_OK="$(printf '%s' "$DOH_POST_RESULT" | jq -r '.ok // false')"
POST_RCODE="$(printf '%s' "$DOH_POST_RESULT" | jq -r '.rcode // -1')"
if [[ "$POST_OK" != "true" || "$POST_RCODE" != "0" ]]; then
  echo "DoH POST verification failed: $DOH_POST_RESULT" >&2
  exit 1
fi
GET_OK="$(printf '%s' "$DOH_GET_RESULT" | jq -r '.ok // false')"
GET_RCODE="$(printf '%s' "$DOH_GET_RESULT" | jq -r '.rcode // -1')"
if [[ "$GET_OK" != "true" || "$GET_RCODE" != "0" ]]; then
  echo "DoH GET verification failed: $DOH_GET_RESULT" >&2
  exit 1
fi

POST_ANSWER_LINES="$(printf '%s' "$DOH_POST_RESULT" | jq -r '.answers[] | "\(.type):\(.data):ttl=\(.ttl)"')"
GET_ANSWER_LINES="$(printf '%s' "$DOH_GET_RESULT" | jq -r '.answers[] | "\(.type):\(.data):ttl=\(.ttl)"')"
echo "DoH POST answers:"
echo "$POST_ANSWER_LINES"
echo "DoH GET answers:"
echo "$GET_ANSWER_LINES"

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

if [[ "$CONFIDENCE" != "high" && "$CONFIDENCE" != "medium" && "$CONFIDENCE" != "low" ]]; then
  echo "resolve confidence invalid: $CONFIDENCE" >&2
  exit 1
fi

echo "resolve summary: confidence=$CONFIDENCE rrset_hash=$RRSET_HASH"
echo "✅ firefox DoH verify passed"
