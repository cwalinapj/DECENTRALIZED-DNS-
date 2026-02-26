# Surfpool Mainnet Emulation (All Anchor Programs)

This flow wires Surfpool into the full Anchor workspace so we can emulate a mainnet-like deployment locally.

`Surfpool` is used as the local RPC engine while still using our Anchor workspace and program deployment flow.

## What is wired

- Program list source: `solana/Anchor.toml` section `[programs.localnet]`
- Plan command: `npm run surfpool:plan`
- Full emulation command: `npm run surfpool:emulate-mainnet`
- Deployment behavior: build + deploy + verify every program in deterministic order from `Anchor.toml`

## Commands

```bash
# Show all programs that will be included.
npm run surfpool:plan

# Dry-run plan only (no Surfpool start, no deploy).
DRY_RUN=1 npm run surfpool:emulate-mainnet

# Execute full flow against Surfpool using mainnet datasource.
npm run surfpool:emulate-mainnet
```

## Environment knobs

- `SURFPOOL_NETWORK` (default: `mainnet`)
- `SURFPOOL_HOST` (default: `127.0.0.1`)
- `SURFPOOL_PORT` (default: `8899`)
- `SURFPOOL_WS_PORT` (default: `8900`)
- `SURFPOOL_STUDIO_PORT` (default: `18488`)
- `ANCHOR_WALLET` (default: `~/.config/solana/id.json`)
- `DRY_RUN=1` to print plan only

## Safety checks

- Script fails if required tools are missing: `surfpool`, `anchor`, `solana`, `jq`, `npm`, `curl`.
- Script runs program ID sync gate (`scripts/check_program_id_sync.sh`) before deploy.
- Script verifies each deployed program with `solana program show`.

## Notes

- This is for local emulation only. It does not write to Solana mainnet.
- If your machine already has something on port `8899/8900`, set custom ports via env vars.
