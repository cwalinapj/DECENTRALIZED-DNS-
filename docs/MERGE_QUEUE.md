# Merge Queue

One-at-a-time queue for Codex-managed merges.

| PR # | Branch | Depends On | Status | Notes |
|---:|---|---|---|---|
| 51 | `codex/prX-miner-scoring` | none | pending | Open but appears superseded by newer merge flow; verify before merge. |
| 6 | `copilot/move-receipt-format-md-to-specs` | none | pending | Legacy PR; validate relevance before merge. |
| n/a | `origin/codex/adapter-layer` | follow-up docs | pending | Remote branch exists; open/refresh PR if still required. |
| n/a | `origin/codex/prX-adapters` | adapter-layer | pending | Remote branch exists; open/refresh PR if still required. |
| n/a | `origin/codex/prX-watchdog-policy` | attack-mode docs | pending | Remote branch exists; open/refresh PR if still required. |

## Source Snapshot
- Open PRs are pulled from `gh pr list --state open`.
- Remote queue branches are pulled from `git branch -r | grep origin/codex/`.
