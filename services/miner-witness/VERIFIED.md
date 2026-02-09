# Verified (Devnet) - Miner Witness + Canonical Route Finalization (MVP)

Date: 2026-02-09

This file records a successful end-to-end Design 3 MVP flow on Solana devnet:

- a wallet stakes SOL and claims rewards from `ddns_stake`
- the wallet produces an off-chain witness receipt
- `services/miner-witness` verifies + aggregates receipts off-chain
- miner submits `submit_stake_snapshot` + `submit_aggregate`
- miner calls `finalize_if_quorum`, which CPIs into `ddns_registry.finalize_route`
- canonical route state exists on-chain as a `CanonicalRoute` PDA

## Cluster + Programs

- Cluster: devnet (`https://api.devnet.solana.com`)
- Wallet / miner pubkey: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- `ddns_stake` program id: `6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF`
- `ddns_registry` program id: `5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx`
- `ddns_quorum` program id: `9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB`

## Stake + Rewards

- `init_stake_config` tx: `4ycUHL5WPwicd2NziqXtJAjHXQ8BNV5gFLCETo4tnULEaUFpGhzKU7ZYgypqRemRBkMMCi3yawJ6j2SuGKcqd6kU`
  - reward mint: `4tG8nBWtYvrRsJcXgsviDdkHn7AoruSS54FyBGGc6Bd2`
- `stake(0.1 SOL)` tx: `5b8GxucPMveXnKxW9aXPANH8ureuMHPxyupeC7o6RdyKrujqEjbxduGAnUVeRJcaP5FNka3Yz74HiRrtLEaC8PbH`
  - staked amount: `100000000` lamports
- `claim_rewards` tx: `4avFzxYf6asy1RHdWvfEmmPwJsb24ut6Jpdxd2ymS4hjfPRir38Sb3tiTWjWSorEF23Cpo9j6XtXhFHdbkzMj3CC`
  - user reward ATA: `F2ySS7w6EYUKHtgDVmxGgonMuEhopwq8x22ykop88VBP`

## Receipt Inputs (ReceiptV1)

- name: `example124.dns`
- dest: `https://example.com`
- ttl_s: `300`

Computed (client-side, from `solana/scripts/make_receipt.ts`):

- `name_hash` (sha256(name_lc)): `c3aebb7f8605f1e20ede7fc0f0a0d439517cca813858c3b37838802a284daaf0`
- `dest_hash` (sha256(dest_c)): `100680ad546ce6a577f42f52df33b4cfdca756859e664b8d7de329b150d09ce9`

Domain-separated signature bytes:

`SHA256("DDNS_RECEIPT_V1" || name_hash || dest_hash || observed_at_unix_le_i64 || ttl_le_u32)`

## Miner Witness Submission + Finalization

From `POST /v1/submit-receipts`:

- epoch_id: `4409032`
- receipt_count: `1`
- stake_weight: `100000000`
- receipts_root: `0c7799a7d167167a872a9fa9aaf4dfeace6d0c720f54ed7e56e1dfc1184f11b7`

Transactions:

- init verifier set tx (for current epoch): `3dy9M66BBHDWBTEP2qYDJZxpajsETus2LAeVtGRZ4dmm2c3vbirWEZs4qrNUEGSiT3BZ1nYDS1bbVGWHShiKhuAv`
- submit stake snapshot tx: `4CZGRcJ5BtdzKAeRQX88GFbWQLezAr6HCkkirLTxYLDuXmReCQqpAsiiwMvpYo76G6WVzwi7BaN3v4WGhtod9CVZ`
- submit aggregate tx: `daXgYrT66LARAHWPbfXLfsdohk8Prp3kzJorBP7kcQgF2AhVt1MWqTEP4DxL4xt7fop2vW62URGBsDfmBcYitEu`
- finalize if quorum tx: `4rGgqzVMZ8P5ukZcEL8PkDZkMqQR1wQAR31cMzEbnjj6wZKCbQ85aQmzXbwosMbJjcv55zWCAXTXqfqVPAFRXizb`

PDAs:

- AggregateSubmission PDA: `DcmoT398PHTPFxqpnf39ts5PBFSaEqUwjgMrQRdmgqvk`
- CanonicalRoute PDA: `76mHffJodZijfPtb47fyENwALVz7q6vNoMCccrsX2fBk`

On-chain existence check:

```bash
solana account -u devnet 76mHffJodZijfPtb47fyENwALVz7q6vNoMCccrsX2fBk --output json
```

Expected:

- `owner` should be `ddns_registry` program id
- `space` should be `125` (8 discriminator + 117 struct bytes)

## Reproduce (Devnet)

From repo root:

```bash
cd solana
anchor build

# stake init + stake + claim (claim requires at least 1 epoch to pass)
npm run stake -- init
npm run stake -- stake --amount-sol 0.1
npm run stake -- claim

# run miner (in another shell)
cd ../services/miner-witness
npm install
MINER_KEYPAIR=~/.config/solana/id.json SOLANA_RPC_URL=https://api.devnet.solana.com npm run dev

# make + submit receipt
cd ../../solana
npm run make-receipt -- --name example124.dns --dest https://example.com --ttl 300 --out /tmp/ddns-receipt.json
npm run submit-receipts -- --url http://localhost:8790 --in /tmp/ddns-receipt.json
```
