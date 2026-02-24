#!/usr/bin/env bash
set -euo pipefail

MEMORY_FILE="${JIVE_MEMORY_FILE:-$HOME/.jive/memory.jsonl}"
mkdir -p "$(dirname "$MEMORY_FILE")"

health_check() {
  local url="$1"
  curl -fsS "$url" >/dev/null
}

log_memory() {
  local summary="$1"
  printf '{"timestamp":"%s","event":"watchdog","summary":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$summary")" \
    >> "$MEMORY_FILE"
}

GATEWAY_HEALTH_URL="${GATEWAY_HEALTH_URL:-http://127.0.0.1:8054/healthz}"
SEO_HEALTH_URL="${SEO_HEALTH_URL:-http://127.0.0.1:8094/healthz}"

ok=true
if ! health_check "$GATEWAY_HEALTH_URL"; then
  ok=false
  systemctl restart jive-gateway.service 2>/dev/null || true
fi
if ! health_check "$SEO_HEALTH_URL"; then
  ok=false
  systemctl restart jive-seo-oracle.service 2>/dev/null || true
fi

if [[ "$ok" == true ]]; then
  log_memory "watchdog healthy"
  echo "watchdog healthy"
  exit 0
fi

sleep 2
if health_check "$GATEWAY_HEALTH_URL" && health_check "$SEO_HEALTH_URL"; then
  log_memory "watchdog self-healed via restart"
  echo "watchdog recovered"
  exit 0
fi

if [[ -x "${JIVE_ROLLBACK_SCRIPT:-/home/zoly55/DECENTRALIZED-DNS-/scripts/jive_rollback.sh}" ]]; then
  "${JIVE_ROLLBACK_SCRIPT:-/home/zoly55/DECENTRALIZED-DNS-/scripts/jive_rollback.sh}" --print >/tmp/jive_last_snapshot.txt || true
fi

log_memory "watchdog escalation required"
echo "watchdog failed to self-heal"
exit 1
