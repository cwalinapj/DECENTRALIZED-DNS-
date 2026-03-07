# STATUS (Never Lies)

Last updated: 2026-03-07

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
- Latest inventory output is written to:
  - `artifacts/devnet_inventory.json`
  - `artifacts/devnet_inventory.md`
- Human-readable snapshot:
  - `docs/DEVNET_STATUS.md`

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
