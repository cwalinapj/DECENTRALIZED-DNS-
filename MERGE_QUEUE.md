# Merge Queue

Auto-merge queue instructions.

## How to make a PR eligible

1. Target branch: `main`.
2. Add label: `automerge-ok`.
3. PR body must include:

Risk: Low

### Auto-merge Checklist
- [x] Required CI checks are green
- [x] Local-equivalent checks passed
- [x] No secrets or keypairs committed
- [x] Program IDs not hardcoded (env override supported)
- [x] Docs updated if behavior changed

4. Ensure required GitHub checks are green.

PRs without label `automerge-ok` are never auto-merged.

## Run

- Dry-run:
  - `bash scripts/automerge_prs.sh --dry-run --label automerge-ok`
- Real merge run:
  - `bash scripts/automerge_prs.sh --label automerge-ok`

## Current open PR snapshot

| PR # | branch | depends on | status | notes |
|---:|---|---|---|---|
| 6 | `copilot/move-receipt-format-md-to-specs` | none | pending | No `automerge-ok` label by default. |
| 51 | `codex/prX-miner-scoring` | none | pending | Likely superseded; verify before merge. |
| 59 | `codex/merge-guardrails-policy` | none | pending | Guardrails PR; can be labeled for auto-merge once checks pass. |
