#!/usr/bin/env bash
set -euo pipefail

PREFIX=/usr/local
SERVICE_USER=ddns-node
CONFIG_DIR=/etc/ddns-node
DATA_DIR=/var/lib/ddns-node

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

sudo mkdir -p "$CONFIG_DIR" "$DATA_DIR"
sudo chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR"

# Build binary
cargo build --release
sudo cp target/release/ddns-node "$PREFIX/bin/ddns-node"

# Install default config if missing
if [ ! -f "$CONFIG_DIR/config.json" ]; then
  sudo cp config/config.example.json "$CONFIG_DIR/config.json"
fi

# Install systemd unit
sudo cp scripts/systemd/ddns-node.service /etc/systemd/system/ddns-node.service
sudo systemctl daemon-reload
sudo systemctl enable ddns-node.service
sudo systemctl restart ddns-node.service

sudo systemctl status ddns-node.service --no-pager
