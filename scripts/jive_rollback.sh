#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${JIVE_BACKUP_DIR:-$HOME/.jive/backups}"
TARGET_DIR="${JIVE_ROLLBACK_TARGET:-/home/zoly55/DECENTRALIZED-DNS-}"
MODE="${1:-latest}"

latest_snapshot() {
  ls -1t "$BACKUP_DIR"/repo-*.tar.gz 2>/dev/null | head -n1
}

SNAPSHOT="${JIVE_SNAPSHOT_PATH:-}"
if [[ -z "$SNAPSHOT" ]]; then
  SNAPSHOT="$(latest_snapshot)"
fi

if [[ -z "$SNAPSHOT" || ! -f "$SNAPSHOT" ]]; then
  echo "no snapshot available" >&2
  exit 1
fi

if [[ "$MODE" == "--print" ]]; then
  echo "$SNAPSHOT"
  exit 0
fi

echo "rollback ready: $SNAPSHOT"
echo "manual restore command: tar -xzf '$SNAPSHOT' -C '$TARGET_DIR'"
