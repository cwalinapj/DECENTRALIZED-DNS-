#!/usr/bin/env bash
set -euo pipefail

domain="${1:-}"
if [ -z "$domain" ]; then
  echo "Usage: scripts/ns_front_door.sh <domain>" >&2
  exit 1
fi

cat <<EOF
TollDNS authoritative front door for: $domain

1) Set these nameservers at your registrar:
   - ns1.tolldns.io
   - ns2.tolldns.io

2) Seed an initial zone record locally:
   scripts/zone_manager.sh set --name $domain --type A --value 198.51.100.42 --ttl 300

3) Verify local authoritative zone answers:
   scripts/zone_manager.sh resolve --name $domain --type A
EOF
