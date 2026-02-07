#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
COMPOSE_FILE="$ROOT_DIR/scripts/validate/docker-compose.validation.yml"
DATA_DIR="$ROOT_DIR/scripts/validate/data"

mkdir -p "$DATA_DIR"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

compose build ddns-compat-runner
compose up -d db wordpress control-plane

for _ in {1..30}; do
  if compose run --rm wp-cli --allow-root db check --quiet; then
    break
  fi
  sleep 2
done

if ! compose run --rm wp-cli --allow-root core is-installed >/dev/null 2>&1; then
  compose run --rm wp-cli --allow-root core install \
    --url="http://localhost:8088" \
    --title="DDNS Compat" \
    --admin_user="admin" \
    --admin_password="adminpass" \
    --admin_email="admin@example.com" \
    --skip-email
fi

compose run --rm wp-cli --allow-root plugin activate wp-compat-orchestrator
compose run --rm wp-cli --allow-root option update ddns_compat_control_plane_url "http://control-plane:8790"
compose run --rm wp-cli --allow-root option update ddns_compat_api_key "compat-test"
compose run --rm wp-cli --allow-root option update ddns_compat_site_id "site_validation"

# Connect the site, export the bundle, submit it, and capture the job ID.
job_id=$(compose run --rm wp-cli --allow-root eval '
$site_id = get_option("ddns_compat_site_id", "site_validation");
if (!$site_id) {
  $site_id = "site_validation";
  update_option("ddns_compat_site_id", $site_id);
}
$response = ddns_compat_request("POST", "/v1/sites/connect", array(
  "site_url" => home_url(),
  "site_name" => get_bloginfo("name"),
  "site_id" => $site_id,
));
if (!$response["ok"]) {
  fwrite(STDERR, "connect_failed\n");
  exit(1);
}
$bundle = ddns_compat_export_bundle();
$response = ddns_compat_request("POST", "/v1/sites/" . rawurlencode($site_id) . "/bundles", array(
  "bundle" => $bundle,
));
if (!$response["ok"]) {
  fwrite(STDERR, "bundle_failed\n");
  exit(1);
}
$job_id = $response["data"]["job_id"] ?? "";
if (!$job_id) {
  fwrite(STDERR, "job_missing\n");
  exit(1);
}
echo $job_id;
')

report_path="$DATA_DIR/jobs/${job_id}/report.json"
for _ in {1..20}; do
  if [ -f "$report_path" ]; then
    break
  fi
  sleep 2
done

if [ ! -f "$report_path" ]; then
  echo "report_not_found" >&2
  exit 1
fi

node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (!data.ok) { console.error('report_not_ok'); process.exit(1); }" "$report_path"

echo "Validation complete: report ok."
