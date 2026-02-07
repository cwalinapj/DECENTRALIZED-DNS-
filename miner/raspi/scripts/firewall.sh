#!/usr/bin/env bash
set -euo pipefail

# Firewall rules for DECENTRALIZED-DNS RasPi
# Uses UFW (Debian/Raspberry Pi OS friendly).
#
# Defaults:
# - deny incoming
# - allow outgoing
# - allow SSH 22/tcp
# - allow 5353/udp and 5353/tcp from LAN CIDR only
#
# Override LAN CIDR:
#   export DDNS_LAN_CIDR="192.168.1.0/24"

WIRE_PORT="${DDNS_WIRE_PORT:-5353}"
LAN_CIDR="${DDNS_LAN_CIDR:-}"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root: sudo bash scripts/firewall.sh"
  exit 1
fi

if ! command -v ufw >/dev/null 2>&1; then
  echo "Installing ufw..."
  apt-get update
  apt-get install -y ufw
fi

# Try to auto-detect LAN CIDR if not set
if [[ -z "${LAN_CIDR}" ]]; then
  # Get primary IPv4 on wlan0/eth0 or default route interface
  IFACE="$(ip route | awk '/default/ {print $5; exit}')"
  IP4="$(ip -4 addr show "${IFACE}" | awk '/inet / {print $2; exit}' || true)"  # e.g., 192.168.1.10/24
  if [[ -n "${IP4}" ]]; then
    LAN_CIDR="$(python3 - <<PY
import ipaddress
print(ipaddress.ip_interface("${IP4}").network)
PY
)"
  fi
fi

if [[ -z "${LAN_CIDR}" ]]; then
  echo "WARNING: Could not auto-detect LAN CIDR."
  echo "Set DDNS_LAN_CIDR (e.g., 192.168.1.0/24) and re-run."
  exit 1
fi

echo "Using LAN CIDR: ${LAN_CIDR}"
echo "Using wire port: ${WIRE_PORT}"

# Base policy
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp

# Allow wire protocol from LAN only
ufw allow from "${LAN_CIDR}" to any port "${WIRE_PORT}" proto udp
ufw allow from "${LAN_CIDR}" to any port "${WIRE_PORT}" proto tcp

# Enable firewall
ufw --force enable

echo "Firewall enabled."
ufw status verbose
