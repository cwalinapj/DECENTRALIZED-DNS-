# Commands Used (Phase 0 + Phase 1)

## Phase 0 baseline
```bash
git fetch origin --prune
git checkout main
git pull --ff-only
git status --porcelain

gh run list --branch main -L 30 --json databaseId,conclusion,status,workflowName,displayTitle,createdAt,url > docs/audit/baseline/ci/main_runs.json
# for each failing run id
gh run view <id> --log-failed > docs/audit/baseline/ci/logs/main_run_<id>_failed.log
gh run view <id> --json status,conclusion,workflowName,url > docs/audit/baseline/ci/logs/main_run_<id>_summary.json

gh run view <latest_main_run_id> --json databaseId,status,conclusion,workflowName,url,jobs > docs/audit/baseline/ci/main_latest_run.json
```

## Phase 1 inventory
```bash
mkdir -p docs/audit/{inventory,prs,branches,ci,ci/logs,copilot}
git branch -r | sed -n 's|^ *origin/||p' | sort > docs/audit/inventory/remote_branches.txt
gh pr list --state all --limit 200 --json number,title,state,url,headRefName,baseRefName,author,createdAt,mergedAt,isDraft,labels > docs/audit/inventory/prs.json
gh pr list --state open --limit 200 --json number,title,url,headRefName,baseRefName,isDraft,labels > docs/audit/inventory/open_prs.json
```

## Phase 1 per-PR details + checks + failing logs
```bash
for n in $(jq -r '.[].number' docs/audit/inventory/open_prs.json); do
  gh pr view "$n" --json number,title,body,url,headRefName,baseRefName,commits,files,labels,statusCheckRollup > "docs/audit/prs/pr_${n}.json"
  gh pr diff "$n" --name-only > "/tmp/pr_${n}_names.txt"
  gh pr checks "$n" --json name,state,link > "docs/audit/ci/pr_${n}_checks.json"
  # if checks not all SUCCESS:
  head_sha=$(jq -r '.commits[-1].oid // empty' "docs/audit/prs/pr_${n}.json")
  gh run list --commit "$head_sha" --limit 50 --json databaseId,conclusion,status,workflowName,displayTitle,createdAt,url > "docs/audit/ci/pr_${n}_runs.json"
  gh run view <run_id> --json status,conclusion,createdAt,updatedAt,event,workflowName,url > "docs/audit/ci/logs/pr_${n}_run_<run_id>_summary.json"
  gh run view <run_id> --log-failed > "docs/audit/ci/logs/pr_${n}_run_<run_id>_failed.log"
done

gh run list --branch main -L 20 --json databaseId,conclusion,status,workflowName,displayTitle,createdAt,url > docs/audit/ci/main_recent_runs.json
```

## Branch-only audit
```bash
jq -r '.[].headRefName' docs/audit/inventory/prs.json | sort -u > /tmp/pr_heads_all.txt
rg '^codex/' docs/audit/inventory/remote_branches.txt | sort -u > /tmp/codex_remote.txt
comm -23 /tmp/codex_remote.txt /tmp/pr_heads_all.txt > /tmp/codex_no_pr.txt

git diff --name-only origin/main...origin/<branch>
```
