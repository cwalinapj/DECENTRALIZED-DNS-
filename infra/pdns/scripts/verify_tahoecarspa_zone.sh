#!/usr/bin/env bash
set -euo pipefail

ZONE="${1:-tahoecarspa.com}"
NS1="${NS1_HOST:-ns1.tolldns.io}"
NS2="${NS2_HOST:-ns2.tolldns.io}"

if ! command -v pdnsutil >/dev/null 2>&1; then
  echo "error: pdnsutil is required" >&2
  exit 2
fi

zone_dump="$(pdnsutil list-zone "$ZONE")"
echo "$zone_dump"

escape_regex() {
  printf '%s' "$1" | sed 's/[][(){}.^$*+?|\\]/\\&/g'
}

ns1_re="$(escape_regex "$NS1")"
ns2_re="$(escape_regex "$NS2")"

echo "$zone_dump" | grep -E "[[:space:]]IN[[:space:]]+NS[[:space:]]+${ns1_re}[.]?$" >/dev/null || {
  echo "error: missing NS record for $NS1 in ${ZONE}" >&2
  exit 1
}
echo "$zone_dump" | grep -E "[[:space:]]IN[[:space:]]+NS[[:space:]]+${ns2_re}[.]?$" >/dev/null || {
  echo "error: missing NS record for $NS2 in ${ZONE}" >&2
  exit 1
}

echo "ok: verified NS records for ${ZONE}"
