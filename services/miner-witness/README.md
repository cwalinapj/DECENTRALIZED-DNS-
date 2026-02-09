# miner-witness (MVP)

This service is an **MVP bootstrap** component: it submits miner epoch stats to the on-chain `ddns_miner_score` program.

It does **not** verify receipts on-chain. It assumes stats are computed off-chain (by miner/verifier logic) and submitted by an allowlisted submitter in `MinerScoreConfig`.

## Run (devnet or localnet)

Prereqs:
- `anchor build` has been run in `solana/` so `solana/target/idl/ddns_miner_score.json` exists.

Install:
```bash
npm -C services/miner-witness i
```

Run:
```bash
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export MINER_WALLET="$HOME/.config/solana/id.json"
export DDNS_MINER_SCORE_PROGRAM_ID="<program id>"

npm -C services/miner-witness run dev
```

## Endpoints

- `GET /v1/health`
- `POST /v1/report-epoch-stats`

Example:
```bash
curl -sS -X POST "http://127.0.0.1:8787/v1/report-epoch-stats" \\
  -H "content-type: application/json" \\
  -d '{
    "epoch_id": 1,
    "miner": "<miner pubkey>",
    "stake_weight": "1000",
    "aggregates_submitted": 10,
    "unique_name_count": 50,
    "unique_receipt_count": 500,
    "first_submit_slot": 100,
    "last_submit_slot": 150,
    "uptime_score": 10000,
    "correctness_score": 10000,
    "dominance_share_bps": 2000
  }'
```

