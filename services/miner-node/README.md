# Miner Node (MVP REP)

Permissionless miner relay/runner for `ddns_rep`.

## Modes
- One-shot mode: resolve a name set via DoH and submit `award_rep`.
- Relay mode (`MINER_HTTP=1`): accept worker receipts at `POST /v1/submit` and submit `award_rep`.

## Environment
- `SOLANA_RPC_URL` (default `https://api.devnet.solana.com`)
- `MINER_WALLET` (or `ANCHOR_WALLET`)
- `DDNS_REP_PROGRAM_ID` (falls back to `solana/Anchor.toml`)
- `RECURSIVE_UPSTREAMS` (default CF + Google)
- `MINER_NAMES` (comma-separated, default `example.com,netflix.com,cloudflare.com`)
- `MINER_QTYPE` (default `A`)
- `MINER_COLO` (default `local-node`)
- `MINER_HTTP=1` and `MINER_HTTP_PORT` (relay mode)

## Quickstart
```bash
npm -C services/miner-node install
npm -C services/miner-node run build

# one-shot award
SOLANA_RPC_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=$HOME/.config/solana/id.json \
DDNS_REP_PROGRAM_ID=<PROGRAM_ID> \
npm -C services/miner-node run dev

# relay mode
MINER_HTTP=1 MINER_HTTP_PORT=8789 \
SOLANA_RPC_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=$HOME/.config/solana/id.json \
DDNS_REP_PROGRAM_ID=<PROGRAM_ID> \
npm -C services/miner-node run dev
```
