# Merge Queue

One-at-a-time PR merge queue managed by `scripts/merge_prs_one_by_one.sh`.

## Policy
- Merge order is explicit and dependency-aware.
- Status values: `pending`, `blocked`, `merged`.
- No PR merges if CI is failing on the PR or on `main`.

## Queue

| Order | PR | Link | Dependency | Status | Notes |
|---:|---:|---|---|---|---|
| 1 | 51 | https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/51 | none | pending | Superseded by newer integration merge; close or reconcile. |
| 2 | 6 | https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/6 | none | pending | Legacy PR; validate relevance before merge. |
