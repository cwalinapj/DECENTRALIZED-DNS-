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

## Receipt Inputs

- name: `example123.dns`
- dest: `https://example.com`
- ttl_s: `300`

Computed (client-side, from `solana/scripts/make_receipt.ts`):

- `name_hash` (sha256(name_lc)): `7637f6abf851b8c774a1ef91a2b875c4a28684898266879ec3cad6f69a9cd261`
- `dest_hash` (sha256(dest_c)): `100680ad546ce6a577f42f52df33b4cfdca756859e664b8d7de329b150d09ce9`

## Miner Witness Submission + Finalization

From `POST /v1/submit-receipts`:

- epoch_id: `4409017`
- receipt_count: `1`
- stake_weight: `100000000`
- receipts_root: `eb48d10894c6f5a1c632507cd25ea716a70d705f5ba7119ebede8809cb4144ac`

Transactions:

- init verifier set tx (for current epoch): `4bMAHyaaT1YgjdLtADpJfDqY4qUQDZ48uhtufGWFZ71BvGuWzre7wPuwCbJVdvC1ZNNkFxKhpThiDTqyWVy8mS8X`
- submit stake snapshot tx: `24r6SGkUJmqXRVUp2vPWRfJcdVLDFqgts8RnwZq2AfLnpjSScobnnL7pkb6b7t6qDUmgsVxuvDvrJkARZbzFsXgj`
- submit aggregate tx: `4v7ffeNj3E2Dei1gjPW8Bqg492teCJCELtLCBvByE2tWBSFqSRdH6GdoJD4ZGXPCqwtnx6Wom34PUvrwHJEhM2uS`
- finalize if quorum tx: `3fmZXyeZEpBryW8FbaGHZKT9m1wTh5fcG7h8ATcUrQsk2PrCNPDzP5GPU9cPssq5pd8P5gXF9FwfkXC3thPJuWoW`

PDAs:

- AggregateSubmission PDA: `CHNXfQgN1rJgK3YG3Tr6xjtwkdFvJZZrqcegJaTxWwEs`
- CanonicalRoute PDA: `8NxgnTf1RgvpvnpoksUBfTfJcdHJXLWUaf6KVfXNBkqM`

On-chain existence check:

```bash
solana account -u devnet 8NxgnTf1RgvpvnpoksUBfTfJcdHJXLWUaf6KVfXNBkqM --output json
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
npm run make-receipt -- --name example123.dns --dest https://example.com --ttl 300 --out /tmp/ddns-receipt.json
npm run submit-receipts -- --url http://localhost:8790 --in /tmp/ddns-receipt.json
```

