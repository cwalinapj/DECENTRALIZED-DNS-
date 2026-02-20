# STATUS (Never Lies)

Last updated: 2026-02-20

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
