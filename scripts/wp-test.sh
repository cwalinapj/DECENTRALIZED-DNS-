#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose="${root}/docker-compose.wp-test.yml"

docker compose -f "$compose" up -d --remove-orphans

echo "WordPress: http://localhost:8087"
echo "Coordinator: http://localhost:8822/healthz"
echo "Site token: dev-site-token"
