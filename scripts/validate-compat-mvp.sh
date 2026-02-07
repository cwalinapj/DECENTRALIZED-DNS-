#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.validation.yml"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" down -v --remove-orphans || true

echo "Building compat runner image..."
docker build -t ddns-compat-runner:latest "$ROOT/workers/compat-runner"

echo "Starting validation stack..."
docker compose -f "$COMPOSE_FILE" up -d --build

wp_cli() {
  docker compose -f "$COMPOSE_FILE" exec -T wp-cli wp "$@"
}

db_ready() {
  docker compose -f "$COMPOSE_FILE" exec -T db \
    mysqladmin ping -uwordpress -pwordpress --silent
}

echo "Configuring WordPress..."
db_host=$(docker compose -f "$COMPOSE_FILE" exec -T db hostname -i | tr -d '\r' | awk '{print $1}')
wp_cli config create --dbname=wordpress --dbuser=wordpress --dbpass=wordpress --dbhost="$db_host" --skip-check --force
echo "Using DB host: $(wp_cli config get DB_HOST)"

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

if ! timeout 5s wp_cli core is-installed >/dev/null 2>&1; then
  wp_cli core install \
    --url=http://localhost:8080 \
    --title="DDNS Compat MVP" \
    --admin_user=admin \
    --admin_password=adminpass \
    --admin_email=admin@example.com \
    --skip-email
fi

for plugin in woocommerce wp-super-cache wordpress-seo; do
  if ! wp_cli plugin install "$plugin" --activate; then
    echo "Warning: unable to install ${plugin}."
  fi
done
wp_cli plugin activate ddns-compat-orchestrator
wp_cli option update ddns_compat_control_plane_url "http://control-plane:8788"

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
$cp = get_option('ddns_compat_control_plane_url', '');
$site_id = get_option('ddns_compat_site_id', '');
if (!$site_id) {
  $site_id = 'wp_' . wp_generate_uuid4();
}
$manifest = ddns_compat_build_manifest();
$resp = ddns_compat_api_register_site($cp, $site_id, $manifest);
if (!$resp['ok']) {
  fwrite(STDERR, $resp['error'] ?? 'register_failed');
  exit(1);
}
update_option('ddns_compat_site_id', $resp['site']['site_id']);
update_option('ddns_compat_site_token', $resp['site']['site_token']);
echo wp_json_encode($resp);
PHP
)

wp_cli eval --user=admin "$register_php" >/dev/null

echo "Running Playwright wp-admin check..."
docker run --rm --network host \
  -v "$ROOT/scripts:/app/scripts" \
  -v /tmp:/screens \
  -e WP_BASE_URL=http://localhost:8080 \
  -e WP_ADMIN_USER=admin \
  -e WP_ADMIN_PASS=adminpass \
  -e SCREENSHOT_PATH=/screens/wp-admin-compat.png \
  ddns-compat-runner:latest \
  node /app/scripts/wp-admin-playwright.mjs

run_php=$(cat <<'PHP'
$cp = get_option('ddns_compat_control_plane_url', '');
$site_id = get_option('ddns_compat_site_id', '');
$token = get_option('ddns_compat_site_token', '');
if (!$cp || !$site_id || !$token) {
  fwrite(STDERR, 'missing_site_registration');
  exit(1);
}
$bundle_path = ddns_compat_export_bundle();
if (!$bundle_path) {
  fwrite(STDERR, 'bundle_export_failed');
  exit(1);
}
$upload = ddns_compat_api_upload_bundle($cp, $site_id, $token, $bundle_path);
if (!$upload['ok']) {
  fwrite(STDERR, $upload['error'] ?? 'upload_failed');
  exit(1);
}
$job = ddns_compat_api_create_job($cp, $site_id, $token, $upload['upload_id']);
if (!$job['ok']) {
  fwrite(STDERR, $job['error'] ?? 'job_create_failed');
  exit(1);
}
update_option('ddns_compat_last_job_id', $job['job']['id']);
echo wp_json_encode($job);
PHP
)

job_json=$(wp_cli eval --user=admin "$run_php")

job_id=$(printf '%s' "$job_json" | python - <<'PY'
import json
import sys

data = json.load(sys.stdin)
print(data["job"]["id"])
PY
)

site_id=$(wp_cli option get ddns_compat_site_id)
site_token=$(wp_cli option get ddns_compat_site_token)

state=""
echo "Waiting for job ${job_id}..."
for _ in {1..60}; do
  job_resp=$(curl -fsS \
    -H "x-ddns-site-id: ${site_id}" \
    -H "x-ddns-site-token: ${site_token}" \
    "http://localhost:8788/v1/jobs/${job_id}" || true)
  if [ -n "$job_resp" ]; then
    state=$(printf '%s' "$job_resp" | python - <<'PY'
import json
import sys

try:
  data = json.load(sys.stdin)
  print(data["job"]["state"])
except Exception:
  print("")
PY
)
  fi
  if [ "$state" = "done" ]; then
    break
  fi
  if [ "$state" = "failed" ]; then
    echo "Job failed: $job_resp" >&2
    exit 1
  fi
  sleep 5
done

if [ "$state" != "done" ]; then
  echo "Job did not finish in time." >&2
  exit 1
fi

report_json=$(curl -fsS "http://localhost:8788/reports/${job_id}/report.json")
report_ok=$(printf '%s' "$report_json" | python - <<'PY'
import json
import sys

data = json.load(sys.stdin)
print("true" if data.get("ok") is True else "false")
PY
)

if [ "$report_ok" != "true" ]; then
  echo "Report did not return ok:true." >&2
  exit 1
fi

echo "Compat MVP validation completed successfully."
