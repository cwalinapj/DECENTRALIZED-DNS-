#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HERE/../.." && pwd)"
ENV_FILE="$HERE/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE (run: cp .env.example .env && edit)" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

# Validate required variables before any substitution
REQUIRED_VARS=(WAN_IF LAN_IF LAN_NET LAN_IP DHCP_RANGE_START DHCP_RANGE_END DHCP_LEASE)
missing=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "error: the following required variables are unset or empty in $ENV_FILE:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "==> installing packages"
sudo apt-get update
sudo apt-get install -y git curl jq nftables dnsmasq unbound gettext-base

echo "==> enable forwarding"
sudo cp "$HERE/sysctl.conf" /etc/sysctl.d/99-ddns.conf
sudo sysctl --system >/dev/null

echo "==> install nftables rules"
envsubst '${WAN_IF} ${LAN_IF} ${LAN_NET}' < "$HERE/nftables.conf" | sudo tee /etc/nftables.conf >/dev/null
sudo systemctl enable --now nftables

echo "==> install unbound + dnsmasq configs"
sudo cp "$HERE/unbound.conf" /etc/unbound/unbound.conf.d/ddns.conf
envsubst '${LAN_IF} ${LAN_IP} ${DHCP_RANGE_START} ${DHCP_RANGE_END} ${DHCP_LEASE}' < "$HERE/dnsmasq.conf" | sudo tee /etc/dnsmasq.d/ddns.conf >/dev/null
sudo systemctl enable unbound dnsmasq
sudo systemctl restart unbound
sudo systemctl restart dnsmasq

echo "==> done. Next:"
echo "  cd $HERE"
echo "  docker compose up -d --build"
