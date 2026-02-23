#!/usr/bin/env bash
set -euo pipefail

ZONE_FILE="${ZONE_FILE:-gateway/.cache/authoritative_zone.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 2
fi

usage() {
  cat <<'EOF'
Usage:
  scripts/zone_manager.sh set --name NAME --type A|CNAME|TXT --value VALUE [--ttl 300]
  scripts/zone_manager.sh delete --name NAME --type A|CNAME|TXT [--value VALUE]
  scripts/zone_manager.sh list [--name NAME]
  scripts/zone_manager.sh resolve --name NAME [--type A|CNAME|TXT]
EOF
}

cmd="${1:-}"
shift || true

name=""
rtype=""
value=""
ttl="300"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --name) name="${2:-}"; shift 2 ;;
    --type) rtype="${2:-}"; shift 2 ;;
    --value) value="${2:-}"; shift 2 ;;
    --ttl) ttl="${2:-}"; shift 2 ;;
    *) echo "error: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

mkdir -p "$(dirname "$ZONE_FILE")"
if [ ! -f "$ZONE_FILE" ]; then
  printf '{"records":[]}\n' > "$ZONE_FILE"
fi

case "$cmd" in
  set)
    if [ -z "$name" ] || [ -z "$rtype" ] || [ -z "$value" ]; then
      echo "error: --name, --type and --value are required" >&2
      usage
      exit 1
    fi
    jq --arg name "$name" --arg type "$(echo "$rtype" | tr '[:lower:]' '[:upper:]')" --arg value "$value" --argjson ttl "$ttl" '
      .records |= map(select(.name != $name or .type != $type or .value != $value))
      | .records += [{name:$name,type:$type,value:$value,ttl:$ttl,updated_at:(now|todateiso8601)}]
    ' "$ZONE_FILE" > "${ZONE_FILE}.tmp"
    mv "${ZONE_FILE}.tmp" "$ZONE_FILE"
    jq --arg name "$name" --arg type "$(echo "$rtype" | tr '[:lower:]' '[:upper:]')" '.records[] | select(.name == $name and .type == $type)' "$ZONE_FILE"
    ;;
  delete)
    if [ -z "$name" ] || [ -z "$rtype" ]; then
      echo "error: --name and --type are required" >&2
      usage
      exit 1
    fi
    jq --arg name "$name" --arg type "$(echo "$rtype" | tr '[:lower:]' '[:upper:]')" --arg value "$value" '
      .records |= map(select(.name != $name or .type != $type or ($value != "" and .value != $value)))
    ' "$ZONE_FILE" > "${ZONE_FILE}.tmp"
    mv "${ZONE_FILE}.tmp" "$ZONE_FILE"
    echo "ok"
    ;;
  list)
    if [ -n "$name" ]; then
      jq --arg name "$name" '.records[] | select(.name == $name)' "$ZONE_FILE"
    else
      jq '.records' "$ZONE_FILE"
    fi
    ;;
  resolve)
    if [ -z "$name" ]; then
      echo "error: --name is required" >&2
      usage
      exit 1
    fi
    if [ -n "$rtype" ]; then
      jq --arg name "$name" --arg type "$(echo "$rtype" | tr '[:lower:]' '[:upper:]')" '.records[] | select(.name == $name and .type == $type)' "$ZONE_FILE"
    else
      jq --arg name "$name" '.records[] | select(.name == $name)' "$ZONE_FILE"
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac
