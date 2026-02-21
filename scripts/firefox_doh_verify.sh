#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8054}"
NAME="${NAME:-netflix.com}"
QTYPE="${QTYPE:-A}"
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
    *)
      echo "unknown argument: $1" >&2
      echo "usage: bash scripts/firefox_doh_verify.sh [--url <base>] [--name <domain>] [--type A|AAAA]" >&2
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
if [[ "$QTYPE" != "A" && "$QTYPE" != "AAAA" ]]; then
  echo "--type must be A or AAAA" >&2
  exit 2
fi

DOH_ENDPOINT="${BASE_URL%/}/dns-query"
RESOLVE_ENDPOINT="${BASE_URL%/}/v1/resolve?name=$(printf '%s' "$NAME" | jq -sRr @uri)&type=${QTYPE}"

DOH_RESULT="$(
DOH_ENDPOINT="$DOH_ENDPOINT" NAME="$NAME" QTYPE="$QTYPE" node --input-type=module <<'NODE'
import dnsPacket from "./gateway/node_modules/dns-packet/index.js";

const endpoint = process.env.DOH_ENDPOINT;
const name = process.env.NAME;
const qtype = process.env.QTYPE;

const query = dnsPacket.encode({
  type: "query",
  id: 5151,
  flags: dnsPacket.RECURSION_DESIRED,
  questions: [{ type: qtype, name, class: "IN" }]
});

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/dns-message",
    "accept": "application/dns-message"
  },
  body: Buffer.from(query)
});

const bytes = Buffer.from(await res.arrayBuffer());
let decoded = {};
try {
  decoded = dnsPacket.decode(bytes);
} catch (err) {
  console.log(JSON.stringify({ ok: false, status: res.status, error: String(err?.message || err) }));
  process.exit(0);
}

const answers = Array.isArray(decoded.answers)
  ? decoded.answers.map((a) => ({ type: a.type, data: a.data, ttl: a.ttl }))
  : [];

console.log(JSON.stringify({
  ok: res.status === 200 && answers.length > 0,
  status: res.status,
  rcode: Number(decoded?.flags || 0) & 0x0f,
  answers
}));
NODE
)"

DOH_STATUS="$(printf '%s' "$DOH_RESULT" | jq -r '.status // 0')"
DOH_OK="$(printf '%s' "$DOH_RESULT" | jq -r '.ok // false')"
if [[ "$DOH_STATUS" != "200" || "$DOH_OK" != "true" ]]; then
  echo "DoH verification failed: $DOH_RESULT" >&2
  exit 1
fi

ANSWER_LINES="$(printf '%s' "$DOH_RESULT" | jq -r '.answers[] | "\(.type):\(.data):ttl=\(.ttl)"')"
echo "DoH answers:"
echo "$ANSWER_LINES"

RESOLVE_JSON="$(curl -fsS "$RESOLVE_ENDPOINT")"
CONFIDENCE="$(printf '%s' "$RESOLVE_JSON" | jq -r '.confidence // empty')"
RRSET_HASH="$(printf '%s' "$RESOLVE_JSON" | jq -r '.rrset_hash // empty')"

if [[ -z "$CONFIDENCE" || -z "$RRSET_HASH" ]]; then
  echo "resolve payload missing confidence/rrset_hash: $RESOLVE_JSON" >&2
  exit 1
fi

echo "resolve summary: confidence=$CONFIDENCE rrset_hash=$RRSET_HASH"
echo "✅ firefox DoH verify passed"
