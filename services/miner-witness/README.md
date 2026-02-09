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

- Solana CLI configured for devnet and a funded wallet keypair (miner keypair)
- `anchor build` has been run at least once in `solana/` (IDLs at `solana/target/idl/*.json`)

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
  -d '{ "receipts": [ { "version":1, "name":"example.dns", "name_hash":"<hex32>", "dest":"https://example.com", "dest_hash":"<hex32>", "ttl_s":300, "observed_at_unix": 0, "wallet_pubkey":"...", "signature":"base64..." } ] }'
```

## Devnet Quickstart (Copy/Paste)

From repo root (clean clone):

```bash
# 1) build IDLs locally (required by miner in MVP)
cd solana
npm install
anchor build

# 2) start miner
cd ../services/miner-witness
npm install
BOOTSTRAP=1 MINER_KEYPAIR=~/.config/solana/id.json SOLANA_RPC_URL=https://api.devnet.solana.com npm run dev
```

In another shell:

```bash
cd solana

# 3) init stake config (once), stake, and (optionally) claim rewards later
npm run stake -- init
npm run stake -- stake --amount-sol 0.1

# 4) create a receipt + submit to miner
npm run make-receipt -- --name example124.dns --dest https://example.com --ttl 300 --out /tmp/ddns-receipt.json
npm run submit-receipts -- --url http://localhost:8790 --in /tmp/ddns-receipt.json
```
