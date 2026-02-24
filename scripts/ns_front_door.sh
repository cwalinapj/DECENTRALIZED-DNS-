#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/ns_front_door.sh <domain>
  scripts/ns_front_door.sh <domain> --verify

Environment overrides:
  DDNS_NS_1 (default: ns1.tolldns.io)
  DDNS_NS_2 (default: ns2.tolldns.io)
EOF
}

domain="${1:-}"
verify_mode="${2:-}"
if [ -z "$domain" ]; then
  usage >&2
  exit 1
fi

if [ -n "$verify_mode" ] && [ "$verify_mode" != "--verify" ]; then
  usage >&2
  exit 1
fi

ns1="${DDNS_NS_1:-ns1.tolldns.io}"
ns2="${DDNS_NS_2:-ns2.tolldns.io}"

cat <<EOF
TollDNS authoritative front door for: $domain

1) Set these nameservers at your registrar:
   - $ns1
   - $ns2

2) Seed an initial zone record locally:
   scripts/zone_manager.sh set --name $domain --type A --value 198.51.100.42 --ttl 300

3) Verify local authoritative zone answers:
   scripts/zone_manager.sh resolve --name $domain --type A

4) Verify registrar NS delegation (after propagation):
   dig +short NS $domain
EOF

if [ "$verify_mode" = "--verify" ]; then
  if ! command -v dig >/dev/null 2>&1; then
    echo "error: dig is required for --verify mode" >&2
    exit 2
  fi

  actual_ns="$(dig +short NS "$domain" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//' | sort | tr '\n' ' ')"
  expected_ns="$(printf '%s\n%s\n' "$ns1" "$ns2" | tr '[:upper:]' '[:lower:]' | sed 's/\.$//' | sort | tr '\n' ' ')"

  if [ "$actual_ns" = "$expected_ns" ]; then
    echo "✅ NS delegation matches TollDNS set for $domain"
    exit 0
  fi

  echo "❌ NS delegation mismatch for $domain" >&2
  echo "expected: $expected_ns" >&2
  echo "actual:   $actual_ns" >&2
  exit 1
fi
