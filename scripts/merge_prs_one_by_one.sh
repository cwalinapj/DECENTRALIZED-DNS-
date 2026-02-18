#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DRY_RUN=0
LABEL=""
OVERRIDE_TOKEN="${OVERRIDE_MERGE_OK:-}"
ITEMS=()

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/merge_prs_one_by_one.sh [--dry-run] --label <label>
  ./scripts/merge_prs_one_by_one.sh [--dry-run] <PR#> [PR# ...]
USAGE
}

log() { printf '[merge-guard] %s\n' "$*" >&2; }

run() {
  local cmd="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] $cmd"
    return 0
  fi
  eval "$cmd"
}

append_run_log() {
  local status="$1"
  local detail="$2"
  local ts
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  {
    echo "## $ts"
    echo "- status: $status"
    echo "- mode: $( [[ -n "$LABEL" ]] && echo "label:$LABEL" || echo "prs:${ITEMS[*]:-none}" )"
    echo "- detail: $detail"
    echo
  } >> "$ROOT/docs/MERGE_LOG.md"
}

is_repo_clean() {
  local merge_head rebase_head cherry_head status
  merge_head="$(git rev-parse --git-path MERGE_HEAD)"
  rebase_head="$(git rev-parse --git-path REBASE_HEAD)"
  cherry_head="$(git rev-parse --git-path CHERRY_PICK_HEAD)"
  status="$(git status --porcelain)"

  [[ ! -f "$merge_head" ]] || return 1
  [[ ! -f "$rebase_head" ]] || return 1
  [[ ! -f "$cherry_head" ]] || return 1
  [[ -z "$status" ]] || return 1
  return 0
}

require_clean_repo() {
  if ! is_repo_clean; then
    log "ERROR: Repository is not clean (conflict or local changes detected)."
    git status --porcelain || true
    append_run_log "blocked" "dirty-or-conflicted-repo-state"
    exit 1
  fi
}

require_main_green() {
  local conclusion
  conclusion="$(gh run list --branch main -L 1 --json conclusion --jq '.[0].conclusion // "unknown"')"
  if [[ "$conclusion" != "success" ]]; then
    log "ERROR: main CI is not green (latest: $conclusion)."
    append_run_log "blocked" "main-ci-not-green:$conclusion"
    exit 1
  fi
}

collect_prs() {
  local prs=()
  if [[ -n "$LABEL" ]]; then
    mapfile -t prs < <(gh pr list --state open --label "$LABEL" --json number --jq '.[].number')
  else
    for item in "${ITEMS[@]}"; do
      if [[ "$item" =~ ^[0-9]+$ ]]; then
        prs+=("$item")
      else
        log "ERROR: Only PR numbers are supported in positional mode."
        append_run_log "blocked" "invalid-positional-item:$item"
        exit 1
      fi
    done
  fi

  if [[ "${#prs[@]}" -eq 0 ]]; then
    log "No PRs found for the given input."
    append_run_log "noop" "no-prs-found"
    exit 0
  fi

  printf '%s\n' "${prs[@]}"
}

run_local_check() {
  local wt="$1"
  local cmd="$2"
  log "local-check: $cmd"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] (cd '$wt' && $cmd)"
    return 0
  fi
  if ! (cd "$wt" && eval "$cmd"); then
    log "ERROR: local check failed: (cd '$wt' && $cmd)"
    append_run_log "blocked" "local-check-failed:$cmd"
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --label)
      LABEL="${2:-}"
      [[ -z "$LABEL" ]] && { usage; exit 1; }
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      ITEMS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$LABEL" && "${#ITEMS[@]}" -eq 0 ]]; then
  usage
  exit 1
fi

require_clean_repo
require_main_green

mapfile -t PRS < <(collect_prs)

for pr in "${PRS[@]}"; do
  require_clean_repo
  require_main_green

  state="$(gh pr view "$pr" --json state --jq '.state')"
  base_ref="$(gh pr view "$pr" --json baseRefName --jq '.baseRefName')"
  head_ref="$(gh pr view "$pr" --json headRefName --jq '.headRefName')"

  if [[ "$state" != "OPEN" ]]; then
    log "ERROR: PR #$pr is not open (state=$state)."
    append_run_log "blocked" "pr-$pr-not-open"
    exit 1
  fi
  if [[ "$base_ref" != "main" ]]; then
    log "ERROR: PR #$pr base is '$base_ref' (expected 'main')."
    append_run_log "blocked" "pr-$pr-wrong-base:$base_ref"
    exit 1
  fi

  log "Watching checks for PR #$pr"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] gh pr checks $pr --watch"
  else
    if ! gh pr checks "$pr" --watch; then
      log "ERROR: PR #$pr checks failed."
      append_run_log "blocked" "pr-$pr-checks-failed"
      exit 1
    fi
  fi

  ts="$(date +%s)"
  wt="$ROOT/.worktrees/pr-$pr-$ts"
  int_branch="merge-guard-pr-$pr-$ts"

  run "mkdir -p '$ROOT/.worktrees'"
  run "git fetch origin main '$head_ref'"
  run "git worktree add '$wt' -b '$int_branch' 'origin/$head_ref'"
  run "cd '$wt' && git fetch origin main && git rebase origin/main"

  if [[ -d "$wt/packages/attack-mode" ]]; then
    run_local_check "$wt" "npm -C packages/attack-mode ci && npm -C packages/attack-mode run build"
  fi
  if [[ -d "$wt/services/miner-witness" ]]; then
    run_local_check "$wt" "npm -C services/miner-witness ci && npm -C services/miner-witness test && npm -C services/miner-witness run build"
  fi
  if [[ -d "$wt/solana" ]]; then
    run_local_check "$wt" "cd solana && cargo generate-lockfile"
    run_local_check "$wt" "cd solana && anchor build"
  fi

  run "cd '$wt' && git push --force-with-lease origin HEAD:'$head_ref'"

  if [[ -n "$OVERRIDE_TOKEN" ]]; then
    log "OVERRIDE token provided; merge is allowed by script policy."
    run "gh pr merge '$pr' --squash --delete-branch"
    run "git checkout main && git pull --ff-only"
    if [[ -d "$ROOT/services/miner-witness" ]]; then
      run "npm -C '$ROOT/services/miner-witness' test"
    fi
    if [[ -d "$ROOT/solana" ]]; then
      run "cd '$ROOT/solana' && anchor build"
    fi
    append_run_log "merged" "pr-$pr merged with override token"
  else
    log "READY TO MERGE: PR #$pr"
    append_run_log "ready" "pr-$pr checks+rebase+local-checks green"
  fi

  run "git worktree remove '$wt'"
done

log "Done."
