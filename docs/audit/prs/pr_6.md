# PR #6 — Relocate receipt format spec into /specs

- URL: https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/6
- Branch: `copilot/move-receipt-format-md-to-specs` -> `main`
- Labels: (none)
- CI rollup: all-success

## What changed
- `specs/receipt-format.md`

## Why it exists (inferred)
- Relocate receipt format spec into /specs
- PR body excerpt:
```text
The receipt format specification should live under `/specs` per the repository layout. This update moves the document to the correct location to align with the design conventions.

- **Spec placement**
  - Moved `receipt-format.md` from `/docs` to `/specs` to match spec taxonomy.

Example reference (unchanged elsewhere):
```md
- Receipt format: `specs/receipt-format.md`
```
```

## Risk flags
- Touches solana: no
- Touches gateway: no
- Touches miner-witness: no
- Docs-only: no
- Risk level: low

## How to verify
- Best-effort local checks based on touched areas:
