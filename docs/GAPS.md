# Gaps

## Solana build
- `anchor build` fails due to Anchor CLI mismatch and `spl-token-2022` errors.
- Install matching Anchor CLI (0.29.x) or bump `anchor-lang`.
- Pin `spl-token-2022` to compatible versions and reduce stack usage.

## Name registry backend
- `/resolve` currently uses DoH only.
- Internal `.dns` registry backend should be added for private names.
