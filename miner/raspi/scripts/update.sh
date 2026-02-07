#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

git pull
docker compose up -d --build
docker image prune -f
echo "Updated."
