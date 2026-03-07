#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/labs/docker-compose.validation.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "[compat] missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" down -v --remove-orphans || true

echo "Starting validation stack..."
docker compose -f "$COMPOSE_FILE" up -d --build

wp_cli() {
  docker compose -f "$COMPOSE_FILE" exec -T wp-cli wp --url=http://localhost:8080 "$@"
}

db_ready() {
  docker compose -f "$COMPOSE_FILE" exec -T db \
    mysqladmin ping -uwordpress -pwordpress --silent
}

echo "Configuring WordPress..."
wp_cli config create --dbname=wordpress --dbuser=wordpress --dbpass=wordpress --dbhost=db --skip-check --skip-salts --force
echo "Using DB host: db"

for _ in {1..30}; do
  if db_ready >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

if ! db_ready >/dev/null 2>&1; then
  echo "Database not ready." >&2
  exit 1
fi

if ! wp_cli core is-installed >/dev/null 2>&1; then
  wp_cli core install \
    --url=http://localhost:8080 \
    --title="DDNS Compat MVP" \
    --admin_user=admin \
    --admin_password=adminpass \
    --admin_email=admin@example.com \
    --skip-email
fi

wp_cli plugin activate ddns-optin
wp_cli option update ddns_optin_api_url "http://control-plane:8788"
wp_cli option update ddns_optin_site_id "compat-mvp-local"
wp_cli option update ddns_optin_doh_url "http://gateway.invalid/dns-query"

echo "Waiting for control-plane..."
for _ in {1..30}; do
  if curl -fsS http://localhost:8788/healthz >/dev/null; then
    break
  fi
  sleep 2
done

if ! curl -fsS http://localhost:8788/healthz >/dev/null; then
  echo "Control-plane not ready." >&2
  exit 1
fi

register_php=$(cat <<'PHP'
$_REQUEST['_wpnonce'] = wp_create_nonce('ddns_optin_register');
$resp = ddns_optin_handle_register();
if (empty($resp['ok'])) {
  fwrite(STDERR, $resp['error'] ?? 'register_failed');
  exit(1);
}
PHP
)

wp_cli eval --user=admin "$register_php" >/dev/null

site_id=$(wp_cli option get ddns_optin_site_id)
site_token=$(wp_cli option get ddns_optin_site_token)

if [ -z "$site_token" ]; then
  echo "Expected ddns_optin_handle_register() to persist a non-empty site token." >&2
  exit 1
fi

echo "Compat MVP validation completed successfully for site ${site_id}."
