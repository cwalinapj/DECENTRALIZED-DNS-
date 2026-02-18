#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE_REF="${1:-origin/main}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "[markdownlint] base ref '$BASE_REF' not found; linting all markdown as fallback"
  markdownlint "**/*.md" --ignore node_modules --ignore .git --config .markdownlint.json
  exit 0
fi

mapfile -t changed_md < <(git diff --name-only "$BASE_REF"...HEAD -- '*.md' | sed '/^$/d')

if [ "${#changed_md[@]}" -eq 0 ]; then
  echo "[markdownlint] no changed markdown files; skipping"
  exit 0
fi

echo "[markdownlint] changed markdown files:"
printf ' - %s\n' "${changed_md[@]}"

markdownlint "${changed_md[@]}" --config .markdownlint.json
