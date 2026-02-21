#!/usr/bin/env bash
set -euo pipefail

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing dependency: $1" >&2
    exit 2
  fi
}

need_cmd curl
need_cmd jq
need_cmd npm

PORT="${PORT:-18054}"
HOST="${HOST:-127.0.0.1}"
GATEWAY_URL="${GATEWAY_URL:-http://${HOST}:${PORT}}"
DEMO_DNS_NAME="${DEMO_DNS_NAME:-alice.dns}"
DEMO_DNS_TYPE="${DEMO_DNS_TYPE:-A}"
LOG_FILE="${GATEWAY_SMOKE_LOG:-/tmp/ddns-gateway-smoke.log}"

cleanup() {
  if [[ -n "${GW_PID:-}" ]]; then
    kill "${GW_PID}" >/dev/null 2>&1 || true
    wait "${GW_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

PORT="${PORT}" REGISTRY_ENABLED=1 REGISTRY_PATH="../registry/snapshots/registry.json" npm -C gateway run start >"${LOG_FILE}" 2>&1 &
GW_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS "${GATEWAY_URL}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

health_json="$(curl -fsS "${GATEWAY_URL}/healthz")"
icann_json="$(curl -fsS "${GATEWAY_URL}/v1/resolve?name=netflix.com&type=A")"
dns_json="$(curl -fsS "${GATEWAY_URL}/resolve?name=${DEMO_DNS_NAME}")"
status_json="$(curl -fsS "${GATEWAY_URL}/v1/status")"

printf '%s' "${health_json}" | jq -e '.status == "ok"' >/dev/null
printf '%s' "${status_json}" | jq -e '.ok == true and (.recursive_upstreams | type == "array") and (.cache | type == "object") and (.attack_mode.endpoint == "/v1/attack-mode")' >/dev/null
printf '%s' "${icann_json}" | jq -e '.name == "netflix.com" and (.answers | type == "array") and (.confidence | type == "string") and (.upstreams_used | type == "array")' >/dev/null
printf '%s' "${dns_json}" | jq -e '(.name | type == "string") and (.records | type == "array") and (.records | length > 0)' >/dev/null

upstream_count="$(printf '%s' "${status_json}" | jq -r '.recursive_upstreams | length')"
cache_hit_rate="$(printf '%s' "${status_json}" | jq -r '.cache.hit_rate // "n/a"')"
rrset_hash="$(printf '%s' "${icann_json}" | jq -r '.rrset_hash // ""')"
confidence="$(printf '%s' "${icann_json}" | jq -r '.confidence // "unknown"')"
record_count="$(printf '%s' "${dns_json}" | jq -r '.records | length')"

printf 'healthz=ok\n'
printf 'status.upstreams=%s cache.hit_rate=%s\n' "${upstream_count}" "${cache_hit_rate}"
printf 'resolve.icann confidence=%s rrset_hash=%s\n' "${confidence}" "${rrset_hash}"
printf 'resolve.dns name=%s records=%s\n' "${DEMO_DNS_NAME}" "${record_count}"
printf '✅ gateway smoke passed\n'
