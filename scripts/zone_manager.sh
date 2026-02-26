#!/usr/bin/env bash
set -euo pipefail

ZONE_BACKEND="${ZONE_BACKEND:-file}" # file|pdns
ZONE_FILE="${ZONE_FILE:-gateway/.cache/authoritative_zone.json}"
PDNS_API_URL="${PDNS_API_URL:-http://127.0.0.1:8081}"
PDNS_SERVER_ID="${PDNS_SERVER_ID:-localhost}"
PDNS_ZONE="${PDNS_ZONE:-}"
PDNS_API_KEY="${PDNS_API_KEY:-}"

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: $1 is required" >&2
    exit 2
  fi
}

require_bin jq

usage() {
  cat <<'EOF'
Usage:
  scripts/zone_manager.sh set --name NAME --type A|CNAME|TXT --value VALUE [--ttl 300]
  scripts/zone_manager.sh delete --name NAME --type A|CNAME|TXT [--value VALUE]
  scripts/zone_manager.sh list [--name NAME]
  scripts/zone_manager.sh resolve --name NAME [--type A|CNAME|TXT]

Backend selection:
  ZONE_BACKEND=file (default): writes gateway/.cache/authoritative_zone.json
  ZONE_BACKEND=pdns: writes records through PowerDNS API
    Required envs for pdns mode:
      PDNS_API_URL (default http://127.0.0.1:8081)
      PDNS_SERVER_ID (default localhost)
      PDNS_ZONE (zone apex, e.g. example.com)
      PDNS_API_KEY
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

normalize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//'
}

normalize_type() {
  echo "$1" | tr '[:lower:]' '[:upper:]'
}

to_abs_fqdn() {
  local n
  n="$(normalize_name "$1")"
  printf '%s.' "$n"
}

quote_txt_for_pdns() {
  local txt="$1"
  txt="${txt//\\/\\\\}"
  txt="${txt//\"/\\\"}"
  printf '"%s"' "$txt"
}

validate_common_inputs() {
  if [ -n "$name" ]; then
    name="$(normalize_name "$name")"
    if ! is_fqdn_like "$name"; then
      echo "error: --name must be a valid domain/FQDN label" >&2
      exit 1
    fi
  fi

  if [ -n "$rtype" ]; then
    rtype="$(normalize_type "$rtype")"
    case "$rtype" in
      A|CNAME|TXT) ;;
      *)
        echo "error: --type must be one of A|CNAME|TXT" >&2
        exit 1
        ;;
    esac
  fi

  if [ -n "$ttl" ]; then
    if ! is_integer "$ttl" || [ "$ttl" -le 0 ] || [ "$ttl" -gt 86400 ]; then
      echo "error: --ttl must be an integer in range 1..86400" >&2
      exit 1
    fi
  fi

  case "$rtype" in
    A)
      if [ -n "$value" ] && ! is_ipv4 "$value"; then
        echo "error: A record --value must be a valid IPv4 address" >&2
        exit 1
      fi
      ;;
    CNAME)
      if [ -n "$value" ]; then
        value="$(normalize_name "$value")"
        if ! is_fqdn_like "$value"; then
          echo "error: CNAME --value must be a valid FQDN" >&2
          exit 1
        fi
      fi
      ;;
    TXT)
      if [ -n "$value" ] && [ "${#value}" -gt 255 ]; then
        echo "error: TXT --value must be <=255 characters" >&2
        exit 1
      fi
      ;;
  esac
}

pdns_require_env() {
  require_bin curl
  if [ -z "$PDNS_API_KEY" ] || [ -z "$PDNS_ZONE" ]; then
    echo "error: PDNS_API_KEY and PDNS_ZONE are required when ZONE_BACKEND=pdns" >&2
    exit 1
  fi
}

pdns_zone_name() {
  printf '%s.' "$(normalize_name "$PDNS_ZONE")"
}

pdns_rrset_name() {
  local candidate
  candidate="$(to_abs_fqdn "$1")"
  local zone
  zone="$(pdns_zone_name)"
  if [[ "$candidate" != *"$zone" ]]; then
    echo "error: --name must be inside zone $zone" >&2
    exit 1
  fi
  printf '%s' "$candidate"
}

pdns_api() {
  local method="$1"
  local endpoint="$2"
  local body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" \
      -H "X-API-Key: $PDNS_API_KEY" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "$PDNS_API_URL$endpoint"
  else
    curl -fsS -X "$method" \
      -H "X-API-Key: $PDNS_API_KEY" \
      "$PDNS_API_URL$endpoint"
  fi
}

pdns_get_zone_json() {
  local zone
  zone="$(pdns_zone_name)"
  pdns_api GET "/api/v1/servers/$PDNS_SERVER_ID/zones/$zone"
}

pdns_set_record() {
  local rrname
  rrname="$(pdns_rrset_name "$name")"
  local content="$value"
  if [ "$rtype" = "CNAME" ]; then
    content="$(to_abs_fqdn "$content")"
  elif [ "$rtype" = "TXT" ]; then
    content="$(quote_txt_for_pdns "$content")"
  fi

  local existing_records_json
  existing_records_json="$(pdns_get_zone_json | jq -c --arg n "$rrname" --arg t "$rtype" '.rrsets[]? | select(.name == $n and .type == $t) | [.records[]?.content]')"
  if [ -z "$existing_records_json" ]; then
    existing_records_json='[]'
  fi
  local merged_records_json
  merged_records_json="$(jq -cn --argjson existing "$existing_records_json" --arg c "$content" '
    (($existing + [$c]) | unique) | map({content: ., disabled: false})
  ')"

  local payload
  payload="$(jq -cn --arg n "$rrname" --arg t "$rtype" --argjson ttl "$ttl" --argjson records "$merged_records_json" '
    {rrsets:[{name:$n,type:$t,ttl:$ttl,changetype:"REPLACE",records:$records}]}
  ')"
  pdns_api PATCH "/api/v1/servers/$PDNS_SERVER_ID/zones/$(pdns_zone_name)" "$payload" >/dev/null
  pdns_get_zone_json | jq --arg n "$rrname" --arg t "$rtype" '.rrsets[]? | select(.name == $n and .type == $t)'
}

pdns_delete_record() {
  local rrname
  rrname="$(pdns_rrset_name "$name")"
  local rrset_json
  rrset_json="$(pdns_get_zone_json | jq -c --arg n "$rrname" --arg t "$rtype" '.rrsets[]? | select(.name == $n and .type == $t)')"
  if [ -z "$rrset_json" ]; then
    echo "ok"
    return
  fi

  if [ -z "$value" ]; then
    local payload_delete
    payload_delete="$(jq -cn --arg n "$rrname" --arg t "$rtype" '{rrsets:[{name:$n,type:$t,changetype:"DELETE",records:[]}]}' )"
    pdns_api PATCH "/api/v1/servers/$PDNS_SERVER_ID/zones/$(pdns_zone_name)" "$payload_delete" >/dev/null
    echo "ok"
    return
  fi

  local target="$value"
  if [ "$rtype" = "CNAME" ]; then
    target="$(to_abs_fqdn "$target")"
  elif [ "$rtype" = "TXT" ]; then
    target="$(quote_txt_for_pdns "$target")"
  fi

  local remaining_records
  remaining_records="$(jq -cn --argjson rr "$rrset_json" --arg v "$target" '[($rr.records // [])[] | select(.content != $v)]')"
  if [ "$(echo "$remaining_records" | jq 'length')" -eq 0 ]; then
    local payload_empty
    payload_empty="$(jq -cn --arg n "$rrname" --arg t "$rtype" '{rrsets:[{name:$n,type:$t,changetype:"DELETE",records:[]}]}' )"
    pdns_api PATCH "/api/v1/servers/$PDNS_SERVER_ID/zones/$(pdns_zone_name)" "$payload_empty" >/dev/null
  else
    local payload_replace
    payload_replace="$(jq -cn --arg n "$rrname" --arg t "$rtype" --argjson ttl "$ttl" --argjson rec "$remaining_records" '
      {rrsets:[{name:$n,type:$t,ttl:$ttl,changetype:"REPLACE",records:$rec}]}
    ')"
    pdns_api PATCH "/api/v1/servers/$PDNS_SERVER_ID/zones/$(pdns_zone_name)" "$payload_replace" >/dev/null
  fi
  echo "ok"
}

pdns_list_records() {
  local zone_json
  zone_json="$(pdns_get_zone_json)"
  if [ -n "$name" ] && [ -n "$rtype" ]; then
    local rrname
    rrname="$(pdns_rrset_name "$name")"
    echo "$zone_json" | jq --arg n "$rrname" --arg t "$rtype" '.rrsets[]? | select(.name == $n and .type == $t)'
  elif [ -n "$name" ]; then
    local rrname_prefix
    rrname_prefix="$(to_abs_fqdn "$name")"
    echo "$zone_json" | jq --arg n "$rrname_prefix" '.rrsets[]? | select(.name == $n)'
  else
    echo "$zone_json" | jq '.rrsets // []'
  fi
}

pdns_resolve_record() {
  if [ -z "$name" ]; then
    echo "error: --name is required" >&2
    usage
    exit 1
  fi
  local zone_json
  zone_json="$(pdns_get_zone_json)"
  local rrname
  rrname="$(to_abs_fqdn "$name")"
  if [ -n "$rtype" ]; then
    echo "$zone_json" | jq --arg n "$rrname" --arg t "$rtype" '.rrsets[]? | select(.name == $n and .type == $t)'
  else
    echo "$zone_json" | jq --arg n "$rrname" '.rrsets[]? | select(.name == $n)'
  fi
}

file_init_store() {
  mkdir -p "$(dirname "$ZONE_FILE")"
  if [ ! -f "$ZONE_FILE" ]; then
    printf '{"records":[]}\n' > "$ZONE_FILE"
  fi
}

file_set_record() {
  jq --arg name "$name" --arg type "$rtype" --arg value "$value" --argjson ttl "$ttl" '
    .records |= map(select(.name != $name or .type != $type or .value != $value))
    | .records += [{name:$name,type:$type,value:$value,ttl:$ttl,updated_at:(now|todateiso8601)}]
  ' "$ZONE_FILE" > "${ZONE_FILE}.tmp"
  mv "${ZONE_FILE}.tmp" "$ZONE_FILE"
  jq --arg name "$name" --arg type "$rtype" '.records[] | select(.name == $name and .type == $type)' "$ZONE_FILE"
}

file_delete_record() {
  jq --arg name "$name" --arg type "$rtype" --arg value "$value" '
    .records |= map(select(.name != $name or .type != $type or ($value != "" and .value != $value)))
  ' "$ZONE_FILE" > "${ZONE_FILE}.tmp"
  mv "${ZONE_FILE}.tmp" "$ZONE_FILE"
  echo "ok"
}

file_list_records() {
  if [ -n "$name" ]; then
    jq --arg name "$name" '.records[] | select(.name == $name)' "$ZONE_FILE"
  else
    jq '.records' "$ZONE_FILE"
  fi
}

file_resolve_record() {
  if [ -z "$name" ]; then
    echo "error: --name is required" >&2
    usage
    exit 1
  fi
  if [ -n "$rtype" ]; then
    jq --arg name "$name" --arg type "$rtype" '.records[] | select(.name == $name and .type == $type)' "$ZONE_FILE"
  else
    jq --arg name "$name" '.records[] | select(.name == $name)' "$ZONE_FILE"
  fi
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

validate_common_inputs

if [ "$ZONE_BACKEND" = "pdns" ]; then
  pdns_require_env
else
  file_init_store
fi

case "$cmd" in
  set)
    if [ -z "$name" ] || [ -z "$rtype" ] || [ -z "$value" ]; then
      echo "error: --name, --type and --value are required" >&2
      usage
      exit 1
    fi
    if [ "$ZONE_BACKEND" = "pdns" ]; then
      pdns_set_record
    else
      file_set_record
    fi
    ;;
  delete)
    if [ -z "$name" ] || [ -z "$rtype" ]; then
      echo "error: --name and --type are required" >&2
      usage
      exit 1
    fi
    if [ "$ZONE_BACKEND" = "pdns" ]; then
      pdns_delete_record
    else
      file_delete_record
    fi
    ;;
  list)
    if [ "$ZONE_BACKEND" = "pdns" ]; then
      pdns_list_records
    else
      file_list_records
    fi
    ;;
  resolve)
    if [ "$ZONE_BACKEND" = "pdns" ]; then
      pdns_resolve_record
    else
      file_resolve_record
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac
