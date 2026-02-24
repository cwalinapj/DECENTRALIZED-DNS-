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

is_integer() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

is_fqdn_like() {
  [[ "$1" =~ ^\*?([_a-zA-Z0-9-]+\.)+[a-zA-Z]{2,63}$ ]]
}

is_ipv4() {
  local ip="$1"
  if [[ ! "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    return 1
  fi
  IFS='.' read -r o1 o2 o3 o4 <<< "$ip"
  for o in "$o1" "$o2" "$o3" "$o4"; do
    if [ "$o" -gt 255 ]; then
      return 1
    fi
  done
  return 0
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
    rtype="$(echo "$rtype" | tr '[:lower:]' '[:upper:]')"
    name="$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//')"

    if ! is_integer "$ttl" || [ "$ttl" -le 0 ] || [ "$ttl" -gt 86400 ]; then
      echo "error: --ttl must be an integer in range 1..86400" >&2
      exit 1
    fi
    case "$rtype" in
      A|CNAME|TXT) ;;
      *)
        echo "error: --type must be one of A|CNAME|TXT" >&2
        exit 1
        ;;
    esac
    if ! is_fqdn_like "$name"; then
      echo "error: --name must be a valid domain/FQDN label" >&2
      exit 1
    fi
    case "$rtype" in
      A)
        if ! is_ipv4 "$value"; then
          echo "error: A record --value must be a valid IPv4 address" >&2
          exit 1
        fi
        ;;
      CNAME)
        value="$(echo "$value" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//')"
        if ! is_fqdn_like "$value"; then
          echo "error: CNAME --value must be a valid FQDN" >&2
          exit 1
        fi
        ;;
      TXT)
        if [ "${#value}" -gt 255 ]; then
          echo "error: TXT --value must be <=255 characters" >&2
          exit 1
        fi
        ;;
    esac

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
    rtype="$(echo "$rtype" | tr '[:lower:]' '[:upper:]')"
    name="$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//')"
    jq --arg name "$name" --arg type "$(echo "$rtype" | tr '[:lower:]' '[:upper:]')" --arg value "$value" '
      .records |= map(select(.name != $name or .type != $type or ($value != "" and .value != $value)))
    ' "$ZONE_FILE" > "${ZONE_FILE}.tmp"
    mv "${ZONE_FILE}.tmp" "$ZONE_FILE"
    echo "ok"
    ;;
  list)
    if [ -n "$name" ]; then
      name="$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//')"
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
    name="$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//')"
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
