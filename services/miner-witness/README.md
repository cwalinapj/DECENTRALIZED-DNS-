# Miner Witness (MVP)

This service is the MVP “miner/verifier” for Design 3:

- accepts client receipts (HTTP)
- verifies receipts off-chain (signature + freshness + name rules)
- aggregates receipts by `(epoch_id, name_hash, dest_hash)`
- submits `submit_stake_snapshot`, `submit_aggregate`, and `finalize_if_quorum` to Solana (devnet)

MVP constraints:

- miners can be allowlisted (verifier set)
- receipt verification is off-chain
- on-chain stores only aggregate commitments + canonical route state

Devnet proof outputs (tx sigs, PDAs, hashes): see `VERIFIED.md`.

## Run (Devnet)

Prereqs:

- `anchor build` has been run at least once in `solana/` (so IDLs exist at `solana/target/idl/*.json`)

Install + run:

```bash
cd services/miner-witness
npm install
MINER_KEYPAIR=/path/to/miner.json \
SOLANA_RPC_URL=https://api.devnet.solana.com \
npm run dev
```

Optional bootstrap mode (creates config PDAs if missing):

```bash
BOOTSTRAP=1 \
MINER_KEYPAIR=/path/to/miner.json \
SOLANA_RPC_URL=https://api.devnet.solana.com \
npm run dev
```

If your IDLs are not under `solana/target/idl`, set:

- `SOLANA_IDL_DIR=/abs/path/to/idl_dir`

## Env Vars

- `SOLANA_RPC_URL` (default `https://api.devnet.solana.com`)
- `MINER_KEYPAIR` (required): json keypair file for the miner submitter
- `DDNS_REGISTRY_PROGRAM_ID` (default devnet id)
- `DDNS_QUORUM_PROGRAM_ID` (default devnet id)
- `DDNS_STAKE_PROGRAM_ID` (default devnet id)
- `EPOCH_LEN_SLOTS` (default `100`)
- `MIN_RECEIPTS` (default `1`)
- `MIN_STAKE_WEIGHT` (default `0`)
- `MAX_RECEIPT_AGE_SECS` (default `600`)
- `MAX_FUTURE_SKEW_SECS` (default `60`)
- `VERIFIER_MEMBERS` (comma-separated pubkeys; bootstrap only; default includes miner pubkey)

## Endpoints

- `GET /v1/health`
- `POST /v1/submit-receipts`

Example:

```bash
curl -sS -X POST http://localhost:8790/v1/submit-receipts \\
  -H 'content-type: application/json' \\
  -d '{ "receipts": [ { "version":1, "name":"example.dns", "dest":"https://example.com", "ttl_s":300, "observed_at_unix": 0, "wallet_pubkey":"...", "signature":"base64..." } ] }'
```
