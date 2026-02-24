#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/home/zoly55/DECENTRALIZED-DNS-}"
MODE="${JIVE_MODE:-chat}"
TASK_CMD="${AUTOPILOT_TASK_CMD:-}"
MEMORY_FILE="${JIVE_MEMORY_FILE:-$HOME/.jive/memory.jsonl}"
MEMORY_DIR="$(dirname "$MEMORY_FILE")"
BACKUP_DIR="${JIVE_BACKUP_DIR:-$HOME/.jive/backups}"
BRANCH_PREFIX="${JIVE_BRANCH_PREFIX:-codex/autopilot}"

mkdir -p "$MEMORY_DIR" "$BACKUP_DIR"

log_memory() {
  local event="$1"
  local summary="$2"
  local details="${3:-}"
  printf '{"timestamp":"%s","event":"%s","summary":%s,"details":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$event" \
    "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$summary")" \
    "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$details")" \
    >> "$MEMORY_FILE"
}

recall_memory() {
  echo "Recent memory highlights:"
  if [[ -s "$MEMORY_FILE" ]]; then
    python3 - "$MEMORY_FILE" <<'PY'
import json,sys
path=sys.argv[1]
rows=[]
with open(path,'r',encoding='utf-8') as f:
    for line in f:
        line=line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            pass
last=rows[-10:]
while len(last)<10:
    last.insert(0,{"summary":"no_prior_memory_entry"})
for item in last:
    print(f"- {item.get('summary','no_summary')}")
PY
  else
    for _ in $(seq 1 10); do
      echo "- no_prior_memory_entry"
    done
  fi
}

read_secret_file() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  local owner perms
  if stat -f %Su "$path" >/dev/null 2>&1; then
    owner="$(stat -f %Su "$path")"
    perms="$(stat -f %Lp "$path")"
  else
    owner="$(stat -c %U "$path")"
    perms="$(stat -c %a "$path")"
  fi
  if [[ "$owner" != "root" ]]; then
    echo "secret file owner for $path must be root" >&2
    return 1
  fi
  if [[ "$perms" -gt 600 ]]; then
    echo "secret file perms for $path must be 600 or stricter" >&2
    return 1
  fi
  cat "$path"
}

load_secrets() {
  local gh_file="${JIVE_GH_TOKEN_FILE:-/etc/jive-autopilot/github_token}"
  local openai_file="${JIVE_OPENAI_KEY_FILE:-/etc/jive-autopilot/openai_api_key}"
  if token="$(read_secret_file "$gh_file" 2>/dev/null)"; then
    export GH_TOKEN="$token"
  fi
  if okey="$(read_secret_file "$openai_file" 2>/dev/null)"; then
    export OPENAI_API_KEY="$okey"
  fi
}

require_clean_repo() {
  cd "$REPO_ROOT"
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "repo is dirty; aborting autopilot run" >&2
    return 1
  fi
}

run_ci_gates() {
  cd "$REPO_ROOT"
  npm -C gateway test
  npm -C solana test
  npm -C services/seo-oracle test
}

create_snapshot() {
  local sha
  sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local out="$BACKUP_DIR/repo-${stamp}-${sha}.tar.gz"
  tar -czf "$out" -C "$REPO_ROOT" --exclude='.git' .
  echo "$out"
}

deploy_after_merge() {
  local pr_url="$1"
  local snapshot
  snapshot="$(create_snapshot)"
  if [[ -x "$REPO_ROOT/scripts/jive_post_merge_deploy.sh" ]]; then
    "$REPO_ROOT/scripts/jive_post_merge_deploy.sh" "$pr_url" "$snapshot"
  fi
}

check_auto_mergeable() {
  local pr="$1"
  local json
  json="$(gh pr view "$pr" --json mergeable,isDraft,statusCheckRollup)"
  python3 - <<'PY' "$json"
import json,sys
j=json.loads(sys.argv[1])
if j.get("isDraft"):
    print("draft")
    sys.exit(2)
if j.get("mergeable") != "MERGEABLE":
    print(f"mergeable={j.get('mergeable')}")
    sys.exit(3)
checks=j.get("statusCheckRollup") or []
if not checks:
    print("no_checks")
    sys.exit(4)
bad=[]
for c in checks:
    status=c.get("status")
    conc=c.get("conclusion")
    name=c.get("name","check")
    if status != "COMPLETED":
        bad.append(f"{name}:status={status}")
    elif conc not in ("SUCCESS","NEUTRAL","SKIPPED"):
        bad.append(f"{name}:conclusion={conc}")
if bad:
    print("; ".join(bad))
    sys.exit(5)
print("ok")
PY
}

run_autopilot() {
  require_clean_repo
  load_secrets
  recall_memory

  if [[ -z "$TASK_CMD" ]]; then
    log_memory "autopilot_skipped" "autopilot mode requested without AUTOPILOT_TASK_CMD" ""
    echo "AUTOPILOT_TASK_CMD is required in autopilot mode" >&2
    return 1
  fi

  local ts branch wt pr_url
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  branch="${BRANCH_PREFIX}-${ts}"
  wt="/tmp/jive-autopilot-${ts}"

  git -C "$REPO_ROOT" fetch origin --prune
  git -C "$REPO_ROOT" worktree add "$wt" -b "$branch" origin/main
  trap 'git -C "$REPO_ROOT" worktree remove "$wt" --force 2>/dev/null || true; git -C "$REPO_ROOT" worktree prune || true' EXIT

  (cd "$wt" && bash -lc "$TASK_CMD")

  if [[ -z "$(git -C "$wt" status --porcelain)" ]]; then
    log_memory "autopilot_noop" "task produced no changes" "$TASK_CMD"
    echo "No changes produced; exiting"
    return 0
  fi

  run_ci_gates

  (cd "$wt" && git add -A && git commit -m "chore(autopilot): apply sandboxed task" && git push -u origin "$branch")
  pr_url="$(cd "$wt" && gh pr create --base main --head "$branch" --title "autopilot: sandboxed task update" --body "Automated sandbox run with CI gates.")"
  log_memory "pr_opened" "autopilot opened PR" "$pr_url"

  gh pr checks "$pr_url" --watch
  if ! check_auto_mergeable "$pr_url" >/tmp/jive-automerge-check.txt 2>&1; then
    local reason
    reason="$(cat /tmp/jive-automerge-check.txt 2>/dev/null || echo not_eligible)"
    log_memory "automerge_blocked" "automerge not eligible" "$reason"
    echo "Automerge blocked: $reason"
    return 2
  fi

  gh pr merge "$pr_url" --squash --delete-branch
  deploy_after_merge "$pr_url"
  log_memory "autopilot_merged" "autopilot merged and deployed" "$pr_url"
  echo "autopilot complete: $pr_url"
}

case "$MODE" in
  chat)
    recall_memory
    echo "chat mode: set JIVE_MODE=autopilot AUTOPILOT_TASK_CMD='<command>' to execute sandboxed automation."
    log_memory "chat_plan" "chat mode requested autopilot explanation" ""
    ;;
  autopilot)
    run_autopilot
    ;;
  *)
    echo "unknown JIVE_MODE=$MODE" >&2
    exit 1
    ;;
esac
