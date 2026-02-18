# Baseline CI Local Proof

Date (UTC):
- 2026-02-18 22:00:41 UTC

Commands run:

gh run list --branch main -L 30 --json databaseId,conclusion,status,workflowName,displayTitle,createdAt,url > docs/audit/baseline/ci/main_runs.json
LATEST=$(jq -r '.[0].databaseId' docs/audit/baseline/ci/main_runs.json)
gh run view "$LATEST" --json databaseId,status,conclusion,workflowName,url,jobs > docs/audit/baseline/ci/main_latest_run.json

Results:
- Latest run status: completed
- Latest run conclusion: success
- Latest run workflow: ci
- Latest run URL: https://github.com/cwalinapj/DECENTRALIZED-DNS-/actions/runs/22158492811

Latest run jobs:
Raspi TS package builds	success
MVP resolver checks	success
MVP root tests	success
Compat MVP validation	success
Docs formatting (markdownlint)	success

Interpretation:
- Main baseline is currently green; no additional CI-fix patch required before Phase 1.
