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

echo "==> installing packages"
sudo apt-get update
sudo apt-get install -y git curl jq nftables dnsmasq unbound

echo "==> enable forwarding"
sudo cp "$HERE/sysctl.conf" /etc/sysctl.d/99-ddns.conf
sudo sysctl --system >/dev/null

echo "==> install nftables rules (edit nftables.conf if your IF names differ)"
sudo cp "$HERE/nftables.conf" /etc/nftables.conf
sudo systemctl enable --now nftables

echo "==> install unbound + dnsmasq configs (edit LAN IP/IF if needed)"
sudo cp "$HERE/unbound.conf" /etc/unbound/unbound.conf.d/ddns.conf
sudo cp "$HERE/dnsmasq.conf" /etc/dnsmasq.d/ddns.conf
sudo systemctl enable unbound dnsmasq
sudo systemctl restart unbound
sudo systemctl restart dnsmasq

echo "==> done. Next:"
echo "  cd $HERE"
echo "  docker compose up -d --build"
