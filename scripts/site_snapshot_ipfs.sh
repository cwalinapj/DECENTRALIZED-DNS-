#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 2
fi

SOURCE_DIR="${1:-}"
OUTPUT_DIR="${2:-gateway/.cache/site-snapshots}"
SITE_VERSION="${SITE_VERSION:-dev}"

if [ -z "$SOURCE_DIR" ]; then
  echo "Usage: scripts/site_snapshot_ipfs.sh <static_dir> [output_dir]" >&2
  exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
  echo "error: source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
safe_ts="$(echo "$timestamp" | tr ':Z' '--')"
archive_path="$OUTPUT_DIR/snapshot-$safe_ts.tar.gz"
artifact_path="$OUTPUT_DIR/artifact-$safe_ts.json"
git_sha="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"

tar -czf "$archive_path" -C "$SOURCE_DIR" .

pin_mode="stub"
if command -v ipfs >/dev/null 2>&1; then
  cid="$(ipfs add -Qr "$archive_path")"
  pin_mode="local_ipfs"
else
  cid="stub-$(sha256sum "$archive_path" | awk '{print $1}' | cut -c1-46)"
fi

jq -n \
  --arg cid "$cid" \
  --arg timestamp "$timestamp" \
  --arg git_sha "$git_sha" \
  --arg site_version "$SITE_VERSION" \
  --arg archive_path "$archive_path" \
  --arg pin_mode "$pin_mode" \
  '{cid:$cid,timestamp:$timestamp,git_sha:$git_sha,site_version:$site_version,archive_path:$archive_path,pin_mode:$pin_mode}' \
  > "$artifact_path"

echo "snapshot_archive=$archive_path"
echo "artifact_json=$artifact_path"
echo "cid=$cid"
