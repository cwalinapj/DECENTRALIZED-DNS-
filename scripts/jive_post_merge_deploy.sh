#!/usr/bin/env bash
set -euo pipefail

PR_URL="${1:-}"
SNAPSHOT_PATH="${2:-}"
REPO_ROOT="${REPO_ROOT:-/home/zoly55/DECENTRALIZED-DNS-}"
STATE_DIR="${JIVE_STATE_DIR:-$HOME/.jive/state}"
mkdir -p "$STATE_DIR"

printf '{"timestamp":"%s","event":"deploy_stub","pr_url":"%s","snapshot":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PR_URL" "$SNAPSHOT_PATH" >> "$STATE_DIR/deploy-log.jsonl"

if [[ -n "${JIVE_DEPLOY_HOOK_URL:-}" ]]; then
  curl -fsS -X POST "$JIVE_DEPLOY_HOOK_URL" \
    -H 'content-type: application/json' \
    -d "{\"pr_url\":\"$PR_URL\",\"snapshot\":\"$SNAPSHOT_PATH\",\"mode\":\"stub\"}" >/dev/null
fi

echo "deploy stub complete"
