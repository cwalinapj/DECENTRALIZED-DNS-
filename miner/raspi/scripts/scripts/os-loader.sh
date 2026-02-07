#!/usr/bin/env bash
set -euo pipefail

# DECENTRALIZED-DNS RasPi OS Loader
# - Assumes NVMe already mounted at /mnt/nvme
# - Does NOT format disks
# - Installs Docker + Compose plugin if missing
# - Starts compose stack and installs systemd autostart unit
# - Applies UFW firewall rules

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RASPI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SERVICE_NAME="ddns-raspi.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

NVME_MOUNT="/mnt/nvme"
DATA_DIR="${NVME_MOUNT}/ddns/edge_data"

echo "[1/8] Preconditions..."
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root: sudo bash scripts/os-loader.sh"
  exit 1
fi

if [[ ! -d "${NVME_MOUNT}" ]]; then
  echo "ERROR: ${NVME_MOUNT} not found. Mount NVMe first."
  exit 1
fi

echo "[2/8] NVMe directories..."
mkdir -p "${DATA_DIR}"
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  chown -R "${SUDO_USER}:${SUDO_USER}" "${NVME_MOUNT}/ddns" || true
fi

echo "[3/8] Docker install (if missing)..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "[4/8] Docker Compose plugin (if missing)..."
if ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker-compose-plugin
fi

echo "[5/8] Enable docker..."
systemctl enable --now docker

echo "[6/8] Env file..."
cd "${RASPI_DIR}"
if [[ ! -f ".env" && -f ".env.example" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Edit ${RASPI_DIR}/.env before production use."
fi

echo "[7/8] Start stack..."
docker compose up -d --build

echo "[8/8] systemd autostart..."
cat > "${SERVICE_PATH}" <<EOF
[Unit]
Description=DECENTRALIZED-DNS RasPi Docker Stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${RASPI_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
RemainAfterExit=yes
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

echo "Applying firewall rules..."
bash "${SCRIPT_DIR}/firewall.sh"

echo ""
echo "DONE."
echo "- docker compose ps"
echo "- GUI: http://<raspi-ip>:${DDNS_GUI_PORT:-8080}"
echo "- systemctl status ${SERVICE_NAME} --no-pager"
