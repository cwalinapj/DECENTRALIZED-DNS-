# STATUS (Never Lies)

Last updated: 2026-03-20

## MVP demo-critical deployment gate

The deploy/inventory scripts now use a narrowed required set for demo readiness:

- `ddns_anchor`
- `ddns_registry`
- `ddns_quorum`
- `ddns_stake`

These appear in scripts as `DEMO_CRITICAL_REQUIRED`.

## Current devnet truth

- Deploy wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- RPC: `https://api.devnet.solana.com`
- Current deploy wallet balance after deploying and pinning all programs: `7.539402880 SOL`
- Latest inventory output is written to:
  - `artifacts/devnet_inventory.json`
  - `artifacts/devnet_inventory.md`
- Human-readable snapshot:
  - `docs/DEVNET_STATUS.md`

## Deploy wallet audit (repo + historical refs)

Historical `ddns_*` program IDs were scanned across the checked-out repo (including `docs/` and `solana/VERIFIED.md`) and checked on devnet.

- Wallet-controlled live programs found before cleanup work: `20`
- Current pinned live programs: `17`
- Historical live IDs still controlled by the deploy wallet: `0`
- Pinned replacement programs deployed on 2026-03-20: `5`
- Duplicate programs closed on 2026-03-20: `12`
- SOL reclaimed from duplicate closures: `26.94207648 SOL`
- Wallet-controlled live programs remaining after cleanup: `17`

All canonical replacements are live and the duplicates referenced above are closed. The pinned manifest now matches devnet; see `solana/program_ids.json` or `solana/Anchor.toml` for the current set of IDs.

Current executable/missing truth is determined by fresh inventory runs, not this static page. Run:

```bash
bash scripts/devnet_inventory.sh
```

and read:
- `artifacts/devnet_inventory.json`
- `artifacts/devnet_inventory.md`

## Demo behavior policy

- `scripts/devnet_happy_path.sh` is strict by default:
  - `ALLOW_LOCAL_FALLBACK=0` (default) means on-chain `.dns` path must be real.
  - If resolver output shows local fallback while strict mode is active, demo fails.
- Optional fallback mode requires explicit opt-in:
  - `ALLOW_LOCAL_FALLBACK=1`
  - Script prints `DEMO MODE: LOCAL FALLBACK` prominently.

## Verification source of truth

- Command logs and output snippets: `VERIFIED.md`
- Devnet inventory artifacts: `artifacts/devnet_inventory.json`, `artifacts/devnet_inventory.md`
- Historical repo/GitHub program-ID scan: `python3 scripts/audit_repo_program_history.py`
- Canonical sync helper: `scripts/ensure_devnet_sync.sh`
- GitHub gate: `.github/workflows/devnet_sync.yml` runs that helper whenever programs/docs/scripts change

## Local readiness snapshot

Validated successfully in this checkout on 2026-03-07:

- `npm run mvp:validate:local`
- `make fmt`
- `make lint`
- `make test`
- `make e2e`

Notes:

- Canonical local demo/runtime commands now live in `docs/CANONICAL_DEMO_PATH.md`.
- `make e2e` now exercises a real WordPress-to-control-plane registration flow via `plugins/wp-optin` and `labs/docker-compose.validation.yml`.
- Program-ID drift gate now enforces canonical sources of truth (`solana/Anchor.toml` + `declare_id!`) and reports local `target/deploy` keypair differences as warnings only.
