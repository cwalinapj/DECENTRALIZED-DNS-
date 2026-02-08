# Repo Tests

This folder centralizes **repo-wide** test commands. Individual packages still
keep their own tests, but this provides a single place to run what is currently
available across the repo.

## What is runnable today
- `ddns-core` unit tests (Vitest)
- `escrow` unit tests (Vitest)
- TypeScript build checks for:
  - `resolver`
  - `services/compat-control-plane`
  - `services/control-plane`
  - `services/vault`

## Run everything
```bash
bash /Users/root1/scripts/DECENTRALIZED-DNS-/tests/run_all.sh
```

## Notes
- This script installs dependencies per package as needed.
- Solana/Anchor tests are not run here yet; they require a Solana toolchain.
