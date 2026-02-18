#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DRY_RUN=0
LABEL=""
ITEMS=()

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/merge_prs_one_by_one.sh [--dry-run] <PR#> [PR# ...]
  ./scripts/merge_prs_one_by_one.sh [--dry-run] --label <label>

Examples:
  ./scripts/merge_prs_one_by_one.sh 56 57 58
  ./scripts/merge_prs_one_by_one.sh --label ddns-merge-queue
USAGE
}

log() { printf '[merge-guard] %s\n' "$*"; }

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] $*"
    return 0
  fi
  eval "$@"
}

cleanup_repo_state() {
  log "Repo not clean. Attempting cleanup."
  run "git merge --abort || true"
  run "git rebase --abort || true"
  run "git cherry-pick --abort || true"
  run "git reset --hard"
  run "git clean -fd"
}

repo_is_clean() {
  local merge_head rebase_head cherry_head status
  merge_head="$(git rev-parse --git-path MERGE_HEAD)"
  rebase_head="$(git rev-parse --git-path REBASE_HEAD)"
  cherry_head="$(git rev-parse --git-path CHERRY_PICK_HEAD)"
  status="$(git status --porcelain)"

  if [[ -f "$merge_head" || -f "$rebase_head" || -f "$cherry_head" || -n "$status" ]]; then
    return 1
  fi
  return 0
}

ensure_clean_or_die() {
  if repo_is_clean; then
    return 0
  fi
  cleanup_repo_state
  if ! repo_is_clean; then
    log "ERROR: Repo still dirty after cleanup. Exiting."
    git status --porcelain || true
    exit 1
  fi
}

require_main_green() {
  local conclusion
  conclusion="$(gh run list --branch main -L 1 --json conclusion --jq '.[0].conclusion // "unknown"')"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] main latest CI conclusion: $conclusion"
    return 0
  fi
  if [[ "$conclusion" != "success" ]]; then
    log "ERROR: main CI is not green (latest conclusion: $conclusion)."
    log "Create and merge a CI fix PR for main first (e.g., ci-fix-main)."
    exit 1
  fi
}

local_checks_in_worktree() {
  local wt="$1"

  if [[ -d "$wt/packages/attack-mode" ]]; then
    run "cd '$wt' && npm -C packages/attack-mode ci && npm -C packages/attack-mode run build"
  fi

  if [[ -d "$wt/services/miner-witness" ]]; then
    run "cd '$wt' && npm -C services/miner-witness ci && npm -C services/miner-witness test && npm -C services/miner-witness run build"
  fi

  if [[ -d "$wt/solana" ]]; then
    run "cd '$wt/solana' && cargo generate-lockfile"
    run "cd '$wt/solana' && anchor build"
  fi
}

append_merge_log() {
  local pr="$1"
  local merge_sha="$2"
  local ts
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] append docs/MERGE_LOG.md row for PR #$pr"
    return 0
  fi

  if grep -q "_No guarded merges recorded yet._" docs/MERGE_LOG.md; then
    perl -0777 -i -pe 's/\| _pending_ \| _n\/a_ \| _n\/a_ \| _No guarded merges recorded yet\._ \|\n//g' docs/MERGE_LOG.md
  fi
  echo "| $ts | $pr | $merge_sha | PR checks PASS; main CI green; local checks PASS |" >> docs/MERGE_LOG.md
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
        local pr_num
        pr_num="$(gh pr list --state open --head "$item" --json number --jq '.[0].number // empty')"
        if [[ -z "$pr_num" ]]; then
          log "ERROR: Could not find open PR for head '$item'"
          exit 1
        fi
        prs+=("$pr_num")
      fi
    done
  fi

  if [[ "${#prs[@]}" -eq 0 ]]; then
    log "No PRs found for the given input."
    exit 0
  fi

  printf '%s\n' "${prs[@]}"
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

ensure_clean_or_die
require_main_green

mapfile -t PRS < <(collect_prs)

for pr in "${PRS[@]}"; do
  ensure_clean_or_die
  require_main_green

  local_ts="$(date +%s)"
  wt="$ROOT/.worktrees/merge-pr-${pr}-${local_ts}"
  branch_name="merge-pr-${pr}-${local_ts}"

  head_ref="$(gh pr view "$pr" --json headRefName --jq '.headRefName')"
  base_ref="$(gh pr view "$pr" --json baseRefName --jq '.baseRefName')"

  if [[ "$base_ref" != "main" ]]; then
    log "ERROR: PR #$pr base is '$base_ref' (expected 'main')."
    exit 1
  fi

  log "Processing PR #$pr (head: $head_ref)"

  run "git fetch origin main '$head_ref'"
  run "mkdir -p '$ROOT/.worktrees'"
  run "git worktree add '$wt' -b '$branch_name' 'origin/$head_ref'"

  run "cd '$wt' && git fetch origin main && git rebase origin/main"
  local_checks_in_worktree "$wt"

  run "cd '$wt' && git push --force-with-lease origin HEAD:'$head_ref'"
  run "gh pr checks '$pr' --watch"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    checks_state="$(gh pr checks "$pr" --json state --jq '.[].state' | sort -u | tr '\n' ' ')"
    if [[ "$checks_state" == *"FAILURE"* || "$checks_state" == *"ERROR"* || "$checks_state" == *"PENDING"* ]]; then
      log "ERROR: PR #$pr checks are not all passing ($checks_state). Stopping."
      exit 1
    fi
  fi

  run "gh pr merge '$pr' --squash --delete-branch"

  run "git checkout main"
  run "git pull --ff-only"

  if [[ -d "$ROOT/services/miner-witness" ]]; then
    run "npm -C '$ROOT/services/miner-witness' test"
  fi
  if [[ -d "$ROOT/solana" ]]; then
    run "cd '$ROOT/solana' && anchor build"
  fi

  if [[ "$DRY_RUN" -eq 0 ]]; then
    merge_sha="$(gh pr view "$pr" --json mergeCommit --jq '.mergeCommit.oid')"
  else
    merge_sha="dry-run"
  fi
  append_merge_log "$pr" "$merge_sha"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    run "git worktree remove '$wt'"
  else
    log "[dry-run] would remove worktree $wt"
  fi

  log "Finished PR #$pr"
done

log "Done."
