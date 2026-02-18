# Merge Guardrails

This repository uses strict hard gates for zero-human-approval auto-merge.

## Eligibility Gates

A PR can only be auto-merged when all of the following are true:

1. PR targets `main`, is open, non-draft, and mergeable.
2. Required GitHub checks are fully green.
3. PR has label `automerge-ok`.
4. PR body contains:
   - exact line: `Risk: Low`
   - section header: `### Auto-merge Checklist`
   - checked items:
     - `Required CI checks are green`
     - `Local-equivalent checks passed`
     - `No secrets or keypairs committed`
     - `Program IDs not hardcoded (env override supported)`
     - `Docs updated if behavior changed`

If any gate fails, PR is skipped with reason.

## Local-equivalent checks

The script runs checks based on changed paths.

Default command set:

1. `npm ci`
2. `npm test`
3. `npm -C gateway test && npm -C gateway run build`
4. `npm -C services/miner-witness test && npm -C services/miner-witness run build`
5. `cd solana && cargo generate-lockfile && anchor build`
6. Optional: `cd solana && cargo test -p <new_crate>` for touched `solana/programs/<crate>/`

Path-based selection:

- touches `gateway/` => run gateway checks.
- touches `services/miner-witness/` => run miner-witness checks.
- touches `solana/` => run solana checks.
- docs-only changes => run minimal root checks (`npm ci && npm test`).

## Safety rules

- Script refuses to run with:
  - `MERGE_HEAD`, `REBASE_HEAD`, or `CHERRY_PICK_HEAD` present.
  - non-empty `git status --porcelain`.
- Script never asks for interactive approvals.
- Script never logs secrets.
