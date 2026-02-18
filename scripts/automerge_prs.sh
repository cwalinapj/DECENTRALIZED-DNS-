#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
MERGE_LOG_MD="$ROOT/MERGE_LOG.md"
MERGE_LOG_JSONL="$ROOT/MERGE_LOG.jsonl"

MODE="dry-run"   # dry-run | run
LABEL=""
LIMIT=0
PRS=()

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/automerge_prs.sh --dry-run --label automerge-ok [--limit N]
  bash scripts/automerge_prs.sh --run --label automerge-ok [--limit N]
  bash scripts/automerge_prs.sh --dry-run <PR#> [PR# ...]
USAGE
}

log() { printf '[automerge] %s\n' "$*"; }

is_conflicted_state() {
  local merge_head rebase_head cherry_head
  merge_head="$(git rev-parse --git-path MERGE_HEAD)"
  rebase_head="$(git rev-parse --git-path REBASE_HEAD)"
  cherry_head="$(git rev-parse --git-path CHERRY_PICK_HEAD)"
  [[ -f "$merge_head" || -f "$rebase_head" || -f "$cherry_head" ]]
}

require_clean_repo() {
  local dirty
  if is_conflicted_state; then
    log "ERROR: merge/rebase/cherry-pick in progress"
    exit 1
  fi
  dirty="$(git status --porcelain | rg -v 'MERGE_LOG\.md$|MERGE_LOG\.jsonl$' || true)"
  if [[ -n "$dirty" ]]; then
    log "ERROR: uncommitted changes present"
    printf '%s\n' "$dirty"
    exit 1
  fi
}

ensure_logs() {
  if [[ ! -f "$MERGE_LOG_MD" ]]; then
    cat > "$MERGE_LOG_MD" <<'HDR'
# Merge Log

HDR
  fi
  if [[ ! -f "$MERGE_LOG_JSONL" ]]; then
    : > "$MERGE_LOG_JSONL"
  fi
}

append_logs() {
  local json="$1"
  local ts pr status title
  ts="$(echo "$json" | jq -r '.timestamp')"
  pr="$(echo "$json" | jq -r '.pr')"
  status="$(echo "$json" | jq -r '.decision')"
  title="$(echo "$json" | jq -r '.title')"

  {
    echo "## $ts"
    echo "- PR: #$pr - $title"
    echo "- decision: $status"
    echo "- url: $(echo "$json" | jq -r '.url')"
    echo "- ci: $(echo "$json" | jq -r '.ci.status')"
    echo "- local_checks: $(echo "$json" | jq -r '.local_checks.status')"
    echo
  } >> "$MERGE_LOG_MD"

  echo "$json" >> "$MERGE_LOG_JSONL"
}

checklist_missing_items() {
  local body="$1"
  local missing=()

  printf '%s\n' "$body" | grep -Fx -- "Risk: Low" >/dev/null || missing+=("Risk: Low")
  printf '%s\n' "$body" | grep -F -- "### Auto-merge Checklist" >/dev/null || missing+=("### Auto-merge Checklist")

  local required=(
    "Required CI checks are green"
    "Local-equivalent checks passed"
    "No secrets or keypairs committed"
    "Program IDs not hardcoded (env override supported)"
    "Docs updated if behavior changed"
  )

  local item
  for item in "${required[@]}"; do
    printf '%s\n' "$body" | grep -Fx -- "- [x] ${item}" >/dev/null || missing+=("- [x] ${item}")
  done

  printf '%s\n' "${missing[@]:-}"
}

collect_prs_by_label() {
  mapfile -t PRS < <(gh pr list --state open --base main --label "$LABEL" --json number --jq '.[].number')
}

ensure_label_exists() {
  gh label create automerge-ok --description "Eligible for strict automerge after all hard gates pass" --color 0E8A16 >/dev/null 2>&1 || true
}

hydrate_queue_branches_to_prs() {
  [[ -f MERGE_QUEUE.md ]] || return 0
  local repo owner_repo branch open_pr title body
  owner_repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"

  mapfile -t branches < <(grep -Eo '\`[^`]+\`' MERGE_QUEUE.md | tr -d '`' | rg -v '^PR #|^branch$|^none$|^n/a$' | sort -u)

  local b
  for b in "${branches[@]}"; do
    branch="$b"
    branch="${branch#origin/}"

    # Skip non-codex helper tokens
    [[ "$branch" == *"/"* ]] || continue

    open_pr="$(gh pr list --state open --head "$branch" --json number --jq '.[0].number // empty')"
    if [[ -n "$open_pr" ]]; then
      continue
    fi

    if ! git ls-remote --heads origin "$branch" >/dev/null 2>&1; then
      continue
    fi

    title="autocreated: queue branch $branch"
    body=$'Risk: Medium\n\n### Auto-merge Checklist\n- [ ] Required CI checks are green\n- [ ] Local-equivalent checks passed\n- [ ] No secrets or keypairs committed\n- [ ] Program IDs not hardcoded (env override supported)\n- [ ] Docs updated if behavior changed\n'
    gh pr create --base main --head "$branch" --title "$title" --body "$body" >/dev/null 2>&1 || true
  done
}

run_cmd() {
  local cmd="$1"
  if [[ "$MODE" == "dry-run" ]]; then
    log "[dry-run] $cmd"
    return 0
  fi
  ( eval "$cmd" )
}

LAST_LOCAL_CMDS=""
LAST_LOCAL_RESULTS=""
LAST_LOCAL_STATUS="pass"

main_baseline_failures() {
  local run_id
  run_id="$(gh run list --branch main -L 1 --json databaseId --jq '.[0].databaseId // empty')"
  [[ -n "$run_id" ]] || return 0
  gh run view "$run_id" --json jobs --jq '.jobs[].name as $n | .jobs[] | select(.name==$n and .conclusion!="success") | .name' | sort -u || true
}

pr_check_summary() {
  local pr="$1"
  local out
  out="$(gh pr checks "$pr" --json name,state,link 2>/dev/null || true)"
  echo "$out"
}

ci_gate_with_fallback() {
  local pr="$1"
  local check_json baseline_fail failing_names baseline_sorted failing_sorted
  check_json="$(pr_check_summary "$pr")"
  [[ -n "$check_json" && "$check_json" != "[]" ]] || { echo "no-checks"; return 1; }

  if echo "$check_json" | jq -r '.[] | select(.state == "PENDING" or .state == "QUEUED" or .state == "IN_PROGRESS") | .name' | rg . >/dev/null 2>&1; then
    echo "pending"
    return 1
  fi

  failing_names="$(echo "$check_json" | jq -r '.[] | select(.state != "SUCCESS") | .name' | sort -u)"
  if [[ -z "$failing_names" ]]; then
    echo "pass"
    return 0
  fi

  baseline_fail="$(main_baseline_failures)"
  baseline_sorted="$(printf '%s\n' "$baseline_fail" | sed '/^$/d' | sort -u)"
  failing_sorted="$(printf '%s\n' "$failing_names" | sed '/^$/d' | sort -u)"

  if [[ -n "$baseline_sorted" ]] && comm -23 <(printf '%s\n' "$failing_sorted") <(printf '%s\n' "$baseline_sorted") | rg . >/dev/null 2>&1; then
    echo "fail"
    return 1
  fi

  if [[ -n "$baseline_sorted" ]]; then
    echo "fallback-pass"
    return 0
  fi

  echo "fail"
  return 1
}

contains_secret_paths() {
  local files=("$@")
  local f
  for f in "${files[@]}"; do
    if [[ "$f" =~ (^|/)(\.env|id\.json|.*keypair.*|.*secret.*|.*mnemonic.*|.*\.pem)$ ]]; then
      return 0
    fi
  done
  return 1
}

diffstat_by_dir_json() {
  local files=("$@")
  local solana=0 gateway=0 services=0 docs=0 packages=0 other=0 f
  for f in "${files[@]}"; do
    [[ "$f" == solana/* ]] && ((solana++)) && continue
    [[ "$f" == gateway/* ]] && ((gateway++)) && continue
    [[ "$f" == services/* ]] && ((services++)) && continue
    [[ "$f" == docs/* || "$f" == *.md ]] && ((docs++)) && continue
    [[ "$f" == packages/* ]] && ((packages++)) && continue
    ((other++))
  done
  jq -n --argjson solana "$solana" --argjson gateway "$gateway" --argjson services "$services" --argjson docs "$docs" --argjson packages "$packages" --argjson other "$other" '{solana:$solana,gateway:$gateway,services:$services,docs:$docs,packages:$packages,other:$other}'
}

anchor_toml_program_diff() {
  local head_sha="$1"
  local base_ref="origin/main"
  local base_file head_file
  base_file="$(git show "$base_ref:solana/Anchor.toml" 2>/dev/null || true)"
  head_file="$(git show "$head_sha:solana/Anchor.toml" 2>/dev/null || true)"
  if [[ -z "$base_file" || -z "$head_file" ]]; then
    echo ""
    return 0
  fi

  diff -u <(printf '%s\n' "$base_file" | rg '^\w+\s*=\s*"[A-Za-z0-9]+"' || true) <(printf '%s\n' "$head_file" | rg '^\w+\s*=\s*"[A-Za-z0-9]+"' || true) || true
}

run_local_checks_and_collect() {
  local wt="$1"
  shift
  local files=("$@")
  local cmds=()
  local touched_gateway=0 touched_miner=0 touched_solana=0 touched_attack=0 docs_only=1

  local f
  for f in "${files[@]}"; do
    [[ "$f" == gateway/* ]] && touched_gateway=1
    [[ "$f" == services/miner-witness/* ]] && touched_miner=1
    [[ "$f" == solana/* ]] && touched_solana=1
    [[ "$f" == packages/attack-mode/* ]] && touched_attack=1
    if [[ ! "$f" =~ ^docs/ ]] && [[ ! "$f" =~ \.md$ ]]; then
      docs_only=0
    fi
  done

  if [[ "$docs_only" -eq 1 ]]; then
    cmds+=("npm ci")
    cmds+=("npm test")
  else
    [[ "$touched_attack" -eq 1 && -d "$wt/packages/attack-mode" ]] && cmds+=("npm -C packages/attack-mode ci && npm -C packages/attack-mode run build")
    [[ "$touched_gateway" -eq 1 && -d "$wt/gateway" ]] && cmds+=("npm -C gateway ci && npm -C gateway test && npm -C gateway run build")
    [[ "$touched_miner" -eq 1 && -d "$wt/services/miner-witness" ]] && cmds+=("npm -C services/miner-witness ci && npm -C services/miner-witness test && npm -C services/miner-witness run build")
    if [[ "$touched_solana" -eq 1 && -d "$wt/solana" ]]; then
      cmds+=("cd solana && cargo generate-lockfile && anchor build")
      mapfile -t crates < <(printf '%s\n' "${files[@]}" | rg '^solana/programs/[^/]+/' -o | sed 's#^solana/programs/##;s#/$##' | sort -u)
      local c
      for c in "${crates[@]}"; do
        [[ -n "$c" ]] && cmds+=("cd solana && cargo test -p $c")
      done
    fi
    if [[ "${#cmds[@]}" -eq 0 ]]; then
      cmds+=("npm ci")
      cmds+=("npm test")
    fi
  fi

  local status="pass"
  local run_results=()
  local cmd
  for cmd in "${cmds[@]}"; do
    if [[ "$MODE" == "dry-run" ]]; then
      run_results+=("$cmd => DRY")
      continue
    fi
    if (cd "$wt" && eval "$cmd"); then
      run_results+=("$cmd => PASS")
    else
      run_results+=("$cmd => FAIL")
      status="fail"
      break
    fi
  done

  LAST_LOCAL_CMDS="$(printf '%s\n' "${cmds[@]}")"
  LAST_LOCAL_RESULTS="$(printf '%s\n' "${run_results[@]}")"
  LAST_LOCAL_STATUS="$status"
  [[ "$status" == "pass" ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) MODE="run"; shift ;;
    --dry-run) MODE="dry-run"; shift ;;
    --label) LABEL="${2:-}"; shift 2 ;;
    --limit) LIMIT="${2:-0}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then PRS+=("$1"); shift; else usage; exit 1; fi
      ;;
  esac
done

[[ -n "$LABEL" || "${#PRS[@]}" -gt 0 ]] || { usage; exit 1; }

require_clean_repo
ensure_logs
ensure_label_exists
hydrate_queue_branches_to_prs

if [[ -n "$LABEL" ]]; then collect_prs_by_label; fi

if [[ "${#PRS[@]}" -eq 0 ]]; then
  log "No open PRs found for selection"
  exit 0
fi

repo_full="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
processed=0

for pr in "${PRS[@]}"; do
  (( LIMIT > 0 && processed >= LIMIT )) && break
  require_clean_repo

  pr_json="$(gh pr view "$pr" --json number,title,url,author,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,labels,body)"

  title="$(echo "$pr_json" | jq -r '.title')"
  url="$(echo "$pr_json" | jq -r '.url')"
  author="$(echo "$pr_json" | jq -r '.author.login')"
  state="$(echo "$pr_json" | jq -r '.state')"
  is_draft="$(echo "$pr_json" | jq -r '.isDraft')"
  base_ref="$(echo "$pr_json" | jq -r '.baseRefName')"
  head_ref="$(echo "$pr_json" | jq -r '.headRefName')"
  head_sha="$(echo "$pr_json" | jq -r '.headRefOid')"
  mergeable="$(echo "$pr_json" | jq -r '.mergeable')"
  labels="$(echo "$pr_json" | jq -r '.labels[].name' | paste -sd ',' -)"
  body="$(echo "$pr_json" | jq -r '.body')"

  mapfile -t files < <(gh api repos/"$repo_full"/pulls/"$pr"/files --paginate --jq '.[].filename')
  file_count="${#files[@]}"
  file_preview="$(printf '%s\n' "${files[@]}" | head -n 30)"
  dep_changes="$(printf '%s\n' "${files[@]}" | rg '(Cargo.lock|Cargo.toml|package-lock.json|package.json|Anchor.toml|pnpm-lock.yaml|yarn.lock)$' || true)"
  dir_stats="$(diffstat_by_dir_json "${files[@]}")"

  risk_low="no"
  printf '%s\n' "$body" | grep -Fx -- "Risk: Low" >/dev/null && risk_low="yes"

  mapfile -t missing_items < <(checklist_missing_items "$body" | sed '/^$/d')
  checklist_complete="yes"
  [[ "${#missing_items[@]}" -gt 0 ]] && checklist_complete="no"

  has_label="no"
  [[ ",$labels," == *",automerge-ok,"* ]] && has_label="yes"

  ci_result="$(ci_gate_with_fallback "$pr" || true)"
  ci_status="fail"
  [[ "$ci_result" == "pass" || "$ci_result" == "fallback-pass" ]] && ci_status="$ci_result"
  failing_checks="$(pr_check_summary "$pr" | jq -r '.[] | select(.state != "SUCCESS") | "\(.name):\(.state):\(.link)"' || true)"

  anchor_diff=""
  if printf '%s\n' "${files[@]}" | rg -x 'solana/Anchor.toml' >/dev/null 2>&1; then
    run_cmd "git fetch origin '$head_ref'"
    anchor_diff="$(anchor_toml_program_diff "$head_sha")"
  fi

  wt="/tmp/ddns-automerge-${pr}-$$"
  run_cmd "git fetch origin '$head_ref'"
  run_cmd "git worktree add '$wt' '$head_sha'"
  run_cmd "cd '$wt' && git fetch origin main && git rebase origin/main"
  if run_local_checks_and_collect "$wt" "${files[@]}"; then
    local_status="pass"
  else
    local_status="fail"
  fi
  local_cmds="$LAST_LOCAL_CMDS"
  local_results="$LAST_LOCAL_RESULTS"
  run_cmd "git worktree remove '$wt' --force"

  decision="SKIP"
  reason=""

  if [[ "$state" != "OPEN" || "$is_draft" != "false" || "$base_ref" != "main" ]]; then
    reason="state/draft/base gate"
  elif [[ "$mergeable" == "CONFLICTING" ]]; then
    reason="merge conflict"
  elif [[ "$has_label" != "yes" ]]; then
    reason="missing automerge-ok label"
  elif [[ "$risk_low" != "yes" || "$checklist_complete" != "yes" ]]; then
    reason="risk/checklist gate"
  elif contains_secret_paths "${files[@]}"; then
    reason="secret-like file path gate"
  elif [[ "$ci_status" == "fail" ]]; then
    reason="ci gate"
  elif [[ "$local_status" != "pass" ]]; then
    reason="local checks gate"
  else
    if [[ "$MODE" == "run" ]]; then
      run_cmd "gh pr merge '$pr' --squash --delete-branch"
      merged_sha="$(gh pr view "$pr" --json mergeCommit --jq '.mergeCommit.oid // ""')"
      decision="MERGED $merged_sha"
      reason="all gates passed"
    else
      decision="WOULD MERGE"
      reason="all gates passed"
    fi
  fi

  printf '\n=== AUDIT BLOCK START ===\n'
  printf 'PR: #%s\nTitle: %s\nURL: %s\nAuthor: %s\n' "$pr" "$title" "$url" "$author"
  printf 'Base/Head: %s <- %s\nHead SHA: %s\n' "$base_ref" "$head_ref" "$head_sha"
  printf 'Labels: %s\nLabel automerge-ok: %s\n' "${labels:-none}" "$has_label"
  printf 'Risk: Low present: %s\n' "$risk_low"
  printf 'Checklist complete: %s\n' "$checklist_complete"
  if [[ "$checklist_complete" == "no" ]]; then
    printf 'Checklist missing:\n%s\n' "$(printf '%s\n' "${missing_items[@]}")"
  fi
  printf 'Mergeability: %s\n' "$mergeable"
  printf 'CI status: %s\n' "$ci_status"
  [[ -n "$failing_checks" ]] && printf 'Failing checks:\n%s\n' "$failing_checks"
  printf 'Diffstat by directory: %s\n' "$dir_stats"
  printf 'Changed files (%s):\n%s\n' "$file_count" "$file_preview"
  if (( file_count > 30 )); then
    printf '%s more files omitted\n' "$((file_count-30))"
  fi
  printf 'Dependency-file changes:\n%s\n' "${dep_changes:-none}"
  if [[ -n "$anchor_diff" ]]; then
    printf 'Anchor.toml program ID diff:\n%s\n' "$anchor_diff"
  fi
  printf 'Local-equivalent checks (planned):\n%s\n' "$local_cmds"
  printf 'Local-equivalent results:\n%s\n' "$local_results"
  printf 'Decision: %s %s\n' "$decision" "${reason:+($reason)}"
  printf '=== AUDIT BLOCK END ===\n\n'

  json_obj="$(jq -n \
    --arg timestamp "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg pr "$pr" \
    --arg title "$title" \
    --arg url "$url" \
    --arg author "$author" \
    --arg base "$base_ref" \
    --arg head "$head_ref" \
    --arg head_sha "$head_sha" \
    --arg labels "${labels:-}" \
    --arg has_label "$has_label" \
    --arg risk_low "$risk_low" \
    --arg checklist_complete "$checklist_complete" \
    --arg mergeable "$mergeable" \
    --arg ci_status "$ci_status" \
    --arg failing_checks "$failing_checks" \
    --arg dep_changes "${dep_changes:-}" \
    --arg local_status "$local_status" \
    --arg local_cmds "$local_cmds" \
    --arg local_results "$local_results" \
    --arg decision "$decision" \
    --arg reason "$reason" \
    --argjson diffstat "$dir_stats" \
    --argjson file_count "$file_count" \
    '{timestamp:$timestamp,pr:$pr,title:$title,url:$url,author:$author,base:$base,head:$head,head_sha:$head_sha,labels:$labels,has_automerge_label:$has_label,risk_low:$risk_low,checklist_complete:$checklist_complete,mergeable:$mergeable,ci:{status:$ci_status,failing:$failing_checks},diffstat:$diffstat,file_count:$file_count,dependency_changes:$dep_changes,local_checks:{status:$local_status,commands:$local_cmds,results:$local_results},decision:$decision,reason:$reason}')"
  append_logs "$json_obj"

  processed=$((processed + 1))
done
