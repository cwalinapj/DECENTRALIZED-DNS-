#!/usr/bin/env bash
set -euo pipefail

# Gate A: no protocol drift during MVP polish waves.
# Fails if changes include solana/programs/** unless explicitly allowed.
#
# Override only for explicit protocol-change waves:
#   ALLOW_PROTOCOL_CHANGE=1 bash scripts/check_no_protocol_drift.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${ALLOW_PROTOCOL_CHANGE:-0}" == "1" ]]; then
  echo "[protocol-gate] BYPASS: ALLOW_PROTOCOL_CHANGE=1"
  exit 0
fi

current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
head_ref="${GITHUB_HEAD_REF:-$current_branch}"
if [[ "$head_ref" == "codex/pr-deploy-all-plus-rent-bond" ]]; then
  echo "[protocol-gate] BYPASS: explicit protocol change branch ($head_ref)"
  exit 0
fi

filter_protocol_paths() {
  if command -v rg >/dev/null 2>&1; then
    rg '^solana/programs/' || true
  else
    grep -E '^solana/programs/' || true
  fi
}

diff_range=""
if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
  git fetch origin "${GITHUB_BASE_REF}" --quiet || true
  diff_range="origin/${GITHUB_BASE_REF}...HEAD"
elif git rev-parse --verify origin/main >/dev/null 2>&1; then
  base="$(git merge-base HEAD origin/main)"
  diff_range="${base}...HEAD"
fi

# Include both commit-range changes and local working tree changes.
changed_files="$(
  {
    if [[ -n "$diff_range" ]]; then
      git diff --name-only "$diff_range" || true
    fi
    git diff --name-only || true
    git diff --name-only --cached || true
    git ls-files --others --exclude-standard || true
  } | sed '/^$/d' | sort -u
)"

if [[ -z "$changed_files" ]]; then
  echo "[protocol-gate] PASS: no changed files detected"
  exit 0
fi

protocol_touches="$(printf '%s\n' "$changed_files" | filter_protocol_paths)"
if [[ -n "$protocol_touches" ]]; then
  echo "[protocol-gate] FAIL: changes under solana/programs/** are blocked in MVP polish waves."
  echo "[protocol-gate] touched:"
  printf '%s\n' "$protocol_touches"
  echo "[protocol-gate] action: move protocol edits into a separate PR titled \"protocol change\"."
  exit 1
fi

echo "[protocol-gate] PASS: no protocol drift"
