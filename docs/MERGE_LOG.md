# Merge Log

Append-only execution log for `scripts/merge_prs_one_by_one.sh`.

Each run appends:
- UTC timestamp
- status (`noop`, `ready`, `merged`, `blocked`)
- mode (`--label` or PR list)
- detail summary

## 2026-02-18T00:00:00Z
- status: seed
- mode: n/a
- detail: merge log initialized

