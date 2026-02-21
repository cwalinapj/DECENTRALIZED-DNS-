#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-18054}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
NAME="${NAME:-netflix.com}"
QTYPE="${QTYPE:-A}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing dependency: $1" >&2
    exit 2
  fi
}

require_cmd node
require_cmd curl
require_cmd jq
require_cmd npm

if [[ ! -f "${ROOT_DIR}/gateway/node_modules/dns-packet/index.js" ]]; then
  echo "missing gateway dns-packet dependency; run: npm -C gateway ci" >&2
  exit 2
fi

tmp_dir="$(mktemp -d)"
query_file="${tmp_dir}/query.bin"
response_file="${tmp_dir}/response.bin"
gateway_log="${tmp_dir}/gateway.log"
trap 'rm -rf "$tmp_dir"' EXIT

PORT="${PORT}" npm -C "${ROOT_DIR}/gateway" run start >"${gateway_log}" 2>&1 &
GW_PID=$!
trap 'kill ${GW_PID} >/dev/null 2>&1 || true; rm -rf "$tmp_dir"' EXIT

for _ in $(seq 1 40); do
  if curl -fsS "${BASE_URL}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -fsS "${BASE_URL}/healthz" >/dev/null

resolve_json="$(curl -fsS "${BASE_URL}/v1/resolve?name=${NAME}&type=${QTYPE}")"
echo "${resolve_json}" | jq -e '
  .name == $name and
  .type == $qtype and
  (.answers | type == "array") and
  (.answers | length > 0) and
  (.confidence | IN("high","medium","low")) and
  (.upstreams_used | type == "array") and
  (.rrset_hash | type == "string")
' --arg name "${NAME}" --arg qtype "${QTYPE}" >/dev/null

NAME="${NAME}" QTYPE="${QTYPE}" QUERY_FILE="${query_file}" ROOT_DIR="${ROOT_DIR}" node --input-type=module <<'NODE'
import fs from "node:fs";
const rootDir = process.env.ROOT_DIR;
const dnsPacket = (await import(`${rootDir}/gateway/node_modules/dns-packet/index.js`)).default;
const query = dnsPacket.encode({
  type: "query",
  id: 4242,
  flags: dnsPacket.RECURSION_DESIRED,
  questions: [{ type: process.env.QTYPE, name: process.env.NAME, class: "IN" }]
});
fs.writeFileSync(process.env.QUERY_FILE, Buffer.from(query));
NODE

curl -fsS -X POST "${BASE_URL}/dns-query" \
  -H "content-type: application/dns-message" \
  -H "accept: application/dns-message" \
  --data-binary "@${query_file}" >"${response_file}"

RESPONSE_FILE="${response_file}" EXPECT_TYPE="${QTYPE}" ROOT_DIR="${ROOT_DIR}" node --input-type=module <<'NODE'
import fs from "node:fs";
const rootDir = process.env.ROOT_DIR;
const dnsPacket = (await import(`${rootDir}/gateway/node_modules/dns-packet/index.js`)).default;
const decoded = dnsPacket.decode(fs.readFileSync(process.env.RESPONSE_FILE));
const answers = (decoded.answers || []).filter((a) => String(a.type).toUpperCase() === process.env.EXPECT_TYPE);
if (answers.length === 0) {
  console.error("no matching DNS answers in /dns-query response");
  process.exit(1);
}
NODE

site_response="$(curl -sS -w '\n%{http_code}' "${BASE_URL}/v1/site?name=${NAME}")"
site_body="$(printf '%s' "${site_response}" | sed '$d')"
site_code="$(printf '%s' "${site_response}" | tail -n1)"
if [[ "${site_code}" != "400" ]]; then
  echo "expected /v1/site non-hosting response 400, got ${site_code}" >&2
  exit 1
fi
printf '%s' "${site_body}" | jq -e '.error == "not_hosting_target"' >/dev/null

echo "openapi_verify: PASS"
echo "resolve.name=${NAME} resolve.confidence=$(echo "${resolve_json}" | jq -r '.confidence')"
echo "site.error=not_hosting_target"
