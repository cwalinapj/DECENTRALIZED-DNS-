# Commands Used

## Phase 1 inventory
```bash
mkdir -p docs/audit/{inventory,prs,branches,ci,ci/logs}
git fetch origin --prune
git branch -r | sed -n 's|^ *origin/||p' | sort > docs/audit/inventory/remote_branches.txt
gh pr list --state all --limit 200 --json number,title,state,url,headRefName,baseRefName,author,createdAt,mergedAt,isDraft,labels > docs/audit/inventory/prs.json
gh pr list --state open --limit 200 --json number,title,url,headRefName,baseRefName,isDraft,labels > docs/audit/inventory/open_prs.json
```

## Per-open-PR metadata + summary
```bash
for n in $(jq -r '.[].number' docs/audit/inventory/open_prs.json); do
  gh pr view "$n" --json number,title,body,url,headRefName,baseRefName,commits,files,labels,statusCheckRollup > "docs/audit/prs/pr_${n}.json"
  gh pr diff "$n" --name-only > "/tmp/pr_${n}_names.txt"
  # generated docs/audit/prs/pr_${n}.md from title/body/file list/check status
  gh pr checks "$n" --json name,state,link > "docs/audit/ci/pr_${n}_checks.json" || echo '[]' > "docs/audit/ci/pr_${n}_checks.json"
done
```

## Branch-only audit (codex/* with no open PR)
```bash
jq -r '.[].headRefName' docs/audit/inventory/prs.json | sort -u > /tmp/pr_heads_all.txt
rg '^codex/' docs/audit/inventory/remote_branches.txt | sort -u > /tmp/codex_remote.txt
comm -23 /tmp/codex_remote.txt /tmp/pr_heads_all.txt > /tmp/codex_no_pr.txt

while read -r br; do
  git rev-parse "origin/$br"
  git show -s --format='%s' "origin/$br"
  git diff --name-only origin/main..."origin/$br"
  # generated docs/audit/branches/<branch>.md
 done < /tmp/codex_no_pr.txt
```

## CI log harvesting
```bash
for n in $(jq -r '.[].number' docs/audit/inventory/open_prs.json); do
  gh pr checks "$n" --json name,state,link > "docs/audit/ci/pr_${n}_checks.json" || echo '[]' > "docs/audit/ci/pr_${n}_checks.json"
  # if any check not SUCCESS
  head_sha=$(jq -r '.commits[-1].oid // empty' "docs/audit/prs/pr_${n}.json")
  gh run list --commit "$head_sha" --limit 50 --json databaseId,conclusion,status,workflowName,displayTitle,createdAt,url > "docs/audit/ci/pr_${n}_runs.json"
  # for failed/cancelled/timed_out runs
  gh run view <run_id> --json status,conclusion,createdAt,updatedAt,event,workflowName,url > "docs/audit/ci/logs/pr_${n}_run_<run_id>_summary.json"
  gh run view <run_id> --log-failed > "docs/audit/ci/logs/pr_${n}_run_<run_id>_failed.log"
done

gh run list --branch main -L 20 --json databaseId,conclusion,status,workflowName,displayTitle,createdAt,url > docs/audit/ci/main_recent_runs.json
```
