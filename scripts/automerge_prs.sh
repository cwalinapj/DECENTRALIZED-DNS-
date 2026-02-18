#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DRY_RUN=0
LABEL=""
PRS=()

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/automerge_prs.sh [--dry-run] --label automerge-ok
  bash scripts/automerge_prs.sh [--dry-run] <PR#> [PR# ...]
USAGE
}

log() {
  printf '[automerge] %s\n' "$*"
}

is_conflicted_state() {
  local merge_head rebase_head cherry_head
  merge_head="$(git rev-parse --git-path MERGE_HEAD)"
  rebase_head="$(git rev-parse --git-path REBASE_HEAD)"
  cherry_head="$(git rev-parse --git-path CHERRY_PICK_HEAD)"
  [[ -f "$merge_head" || -f "$rebase_head" || -f "$cherry_head" ]]
}

require_clean_repo() {
  if is_conflicted_state; then
    log "ERROR: merge/rebase/cherry-pick in progress"
    exit 1
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    log "ERROR: uncommitted changes present"
    git status --porcelain
    exit 1
  fi
}

append_merge_log() {
  local status="$1"
  local pr="$2"
  local title="$3"
  local head_sha="$4"
  local merge_sha="$5"
  local checks="$6"
  local ts
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

  {
    echo "| $ts | #$pr | $status | $head_sha | ${merge_sha:-n/a} | $checks | $title |"
  } >> "$ROOT/MERGE_LOG.md"
}

ensure_log_header() {
  if [[ ! -f "$ROOT/MERGE_LOG.md" ]]; then
    cat > "$ROOT/MERGE_LOG.md" <<'HDR'
# Merge Log

| UTC Timestamp | PR | Status | Head SHA | Merge SHA | Checks Run | Title |
|---|---:|---|---|---|---|---|
HDR
  elif ! rg -q "^\| UTC Timestamp \| PR \| Status \|" "$ROOT/MERGE_LOG.md"; then
    printf "\n| UTC Timestamp | PR | Status | Head SHA | Merge SHA | Checks Run | Title |\n|---|---:|---|---|---|---|---|\n" >> "$ROOT/MERGE_LOG.md"
  fi
}

run_cmd() {
  local cmd="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] $cmd"
    return 0
  fi
  eval "$cmd"
}

run_required_checks() {
  local pr="$1"
  local out
  out="$(gh pr checks "$pr" --json name,state,link 2>/dev/null || true)"
  if [[ -z "$out" || "$out" == "[]" ]]; then
    echo "no-checks"
    return 1
  fi

  local non_success
  non_success="$(echo "$out" | jq -r '.[] | select(.state != "SUCCESS") | "\(.name):\(.state):\(.link)"')"
  if [[ -n "$non_success" ]]; then
    echo "$non_success"
    return 1
  fi

  echo "all-required-success"
  return 0
}

body_has_checklist() {
  local body="$1"

  printf '%s\n' "$body" | rg -x "Risk: Low" >/dev/null || return 1
  printf '%s\n' "$body" | rg -F "### Auto-merge Checklist" >/dev/null || return 1

  local required_items=(
    "Required CI checks are green"
    "Local-equivalent checks passed"
    "No secrets or keypairs committed"
    "Program IDs not hardcoded (env override supported)"
    "Docs updated if behavior changed"
  )

  local item
  for item in "${required_items[@]}"; do
    printf '%s\n' "$body" | rg -x "- \[x\] ${item}" >/dev/null || return 1
  done

  return 0
}

collect_prs() {
  if [[ -n "$LABEL" ]]; then
    mapfile -t PRS < <(gh pr list --state open --base main --label "$LABEL" --json number --jq '.[].number')
  fi
}

docs_only_changes() {
  local files=($*)
  local f
  for f in "${files[@]}"; do
    if [[ ! "$f" =~ ^docs/ ]] && [[ ! "$f" =~ \.md$ ]]; then
      return 1
    fi
  done
  return 0
}

run_local_equivalent_checks() {
  local wt="$1"
  shift
  local files=("$@")

  local run_list=()
  local touched_gateway=0
  local touched_miner=0
  local touched_solana=0
  local touched_attack=0

  local f
  for f in "${files[@]}"; do
    [[ "$f" == gateway/* ]] && touched_gateway=1
    [[ "$f" == services/miner-witness/* ]] && touched_miner=1
    [[ "$f" == solana/* ]] && touched_solana=1
    [[ "$f" == packages/attack-mode/* ]] && touched_attack=1
  done

  if docs_only_changes "${files[@]}"; then
    run_list+=("npm ci")
    run_list+=("npm test")
  else
    if [[ "$touched_attack" -eq 1 && -d "$wt/packages/attack-mode" ]]; then
      run_list+=("npm -C packages/attack-mode ci && npm -C packages/attack-mode run build")
    fi
    if [[ "$touched_gateway" -eq 1 && -d "$wt/gateway" ]]; then
      run_list+=("npm -C gateway test && npm -C gateway run build")
    fi
    if [[ "$touched_miner" -eq 1 && -d "$wt/services/miner-witness" ]]; then
      run_list+=("npm -C services/miner-witness test && npm -C services/miner-witness run build")
    fi
    if [[ "$touched_solana" -eq 1 && -d "$wt/solana" ]]; then
      run_list+=("cd solana && cargo generate-lockfile && anchor build")
      mapfile -t new_crates < <(printf '%s\n' "${files[@]}" | rg '^solana/programs/[^/]+/' -o | sed 's#^solana/programs/##;s#/$##' | sort -u)
      local c
      for c in "${new_crates[@]}"; do
        [[ -n "$c" ]] && run_list+=("cd solana && cargo test -p ${c}")
      done
    fi
    if [[ "${#run_list[@]}" -eq 0 ]]; then
      run_list+=("npm ci")
      run_list+=("npm test")
    fi
  fi

  local cmd
  for cmd in "${run_list[@]}"; do
    log "local-check: $cmd"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "[dry-run] (cd '$wt' && $cmd)"
      continue
    fi
    if ! (cd "$wt" && eval "$cmd"); then
      log "FAILED local check command: (cd '$wt' && $cmd)"
      return 1
    fi
  done

  return 0
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
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        PRS+=("$1")
      else
        log "ERROR: PR mode accepts numeric PR IDs only"
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$LABEL" && "${#PRS[@]}" -eq 0 ]]; then
  usage
  exit 1
fi

require_clean_repo
ensure_log_header
collect_prs

if [[ "${#PRS[@]}" -eq 0 ]]; then
  log "No open PRs found for selection"
  exit 0
fi

repo_full="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"

for pr in "${PRS[@]}"; do
  require_clean_repo

  pr_json="$(gh pr view "$pr" --json number,title,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,labels,body,url)"
  title="$(echo "$pr_json" | jq -r '.title')"
  state="$(echo "$pr_json" | jq -r '.state')"
  draft="$(echo "$pr_json" | jq -r '.isDraft')"
  base="$(echo "$pr_json" | jq -r '.baseRefName')"
  head_ref="$(echo "$pr_json" | jq -r '.headRefName')"
  head_sha="$(echo "$pr_json" | jq -r '.headRefOid')"
  mergeable="$(echo "$pr_json" | jq -r '.mergeable')"
  body="$(echo "$pr_json" | jq -r '.body')"
  has_label="$(echo "$pr_json" | jq -r '.labels[].name' | rg -x 'automerge-ok' || true)"

  log "PR #$pr: $title"

  if [[ "$state" != "OPEN" || "$draft" != "false" || "$base" != "main" || "$mergeable" == "CONFLICTING" ]]; then
    log "SKIP #$pr: not open/ready/mergeable"
    append_merge_log "skipped" "$pr" "$title" "$head_sha" "" "gate:state/draft/base/mergeable"
    continue
  fi

  if [[ -z "$has_label" ]]; then
    log "SKIP #$pr: missing label automerge-ok"
    append_merge_log "skipped" "$pr" "$title" "$head_sha" "" "gate:label"
    continue
  fi

  if ! body_has_checklist "$body"; then
    log "SKIP #$pr: Risk/checklist gate failed"
    append_merge_log "skipped" "$pr" "$title" "$head_sha" "" "gate:risk-checklist"
    continue
  fi

  checks_result="$(run_required_checks "$pr" || true)"
  if [[ "$checks_result" != "all-required-success" ]]; then
    log "SKIP #$pr: CI checks not fully green"
    log "$checks_result"
    append_merge_log "skipped" "$pr" "$title" "$head_sha" "" "gate:ci:$checks_result"
    continue
  fi

  wt="/tmp/ddns-automerge-${pr}-$$"
  run_cmd "git fetch origin"
  run_cmd "git worktree add '$wt' '$head_sha'"

  mapfile -t pr_files < <(gh api repos/"$repo_full"/pulls/"$pr"/files --paginate --jq '.[].filename')

  if ! run_local_equivalent_checks "$wt" "${pr_files[@]}"; then
    run_cmd "git worktree remove '$wt' --force"
    append_merge_log "skipped" "$pr" "$title" "$head_sha" "" "gate:local-checks-failed"
    log "STOP: local-equivalent checks failed for PR #$pr"
    exit 1
  fi

  run_cmd "git worktree remove '$wt' --force"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "WOULD MERGE #$pr"
    append_merge_log "would-merge" "$pr" "$title" "$head_sha" "" "ci+local+label+checklist"
    continue
  fi

  run_cmd "gh pr merge '$pr' --squash --delete-branch"
  merge_sha="$(gh pr view "$pr" --json mergeCommit --jq '.mergeCommit.oid // ""')"
  append_merge_log "merged" "$pr" "$title" "$head_sha" "$merge_sha" "ci+local+label+checklist"
  log "MERGED #$pr -> $merge_sha"
done
