# Solana Anchor Scaffold

This program:
- Initializes a config PDA
- Creates/updates `.dns` name records
- Mints + freezes a “toll pass” NFT via minimal SPL token CPI

**Metaplex metadata is applied client-side**, not by the program, to avoid BPF stack overflow.

## Minting Requirements
- The NFT mint must be created client-side with **owner as mint authority**.
- The program mints 1 token and freezes the token account.

## Build
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
anchor build
```

## Apply Metadata (off-chain)
The program does **not** CPI into Metaplex. Use the helper script instead:
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
npm install
node scripts/write_sample_metadata.mjs
# upload scripts/sample-metadata.json somewhere (https://... or ipfs://...)
npm run apply-metadata -- \
  --mint <MINT_PUBKEY> \
  --name "alice.dns" \
  --uri "https://example.com/metadata.json" \
  --symbol "DDNS"
```

Notes:
- The mint authority must still be the wallet running the script.
- If you revoke mint authority, do it **after** metadata is created.

### Dry-run
```bash
npm -C solana run apply-metadata -- \
  --dry-run \
  --mint <MINT_PUBKEY> \
  --name "DDNS Toll Pass" \
  --uri "https://example.com/metadata.json"
```

### Real apply
```bash
npm -C solana run apply-metadata -- \
  --mint <MINT_PUBKEY> \
  --name "DDNS Toll Pass" \
  --uri "https://example.com/metadata.json"
```

### Update existing metadata
```bash
npm -C solana run apply-metadata -- \
  --force \
  --mint <MINT_PUBKEY> \
  --name "DDNS Toll Pass" \
  --uri "https://example.com/metadata.json"
```
`--force` uses `UpdateMetadataAccounts`; it will fail unless your keypair is the update authority.

### Immutable metadata
```bash
npm -C solana run apply-metadata -- \
  --mutable=false \
  --mint <MINT_PUBKEY> \
  --name "DDNS Toll Pass" \
  --uri "https://example.com/metadata.json"
```

### Rotate update authority (optional)
```bash
npm -C solana run apply-metadata -- \
  --force \
  --new-update-authority <PUBKEY> \
  --mint <MINT_PUBKEY> \
  --name "DDNS Toll Pass" \
  --uri "https://example.com/metadata.json"
```

### Non-mint-authority override (optional)
```bash
npm -C solana run apply-metadata -- \
  --allow-non-mint-authority \
  --mint <MINT_PUBKEY> \
  --name "DDNS Toll Pass" \
  --uri "https://example.com/metadata.json"
```

### Master edition (optional)
```bash
npm -C solana run apply-metadata -- \
  --master-edition \
  --mint <MINT_PUBKEY> \
  --name "DDNS Toll Pass" \
  --uri "https://example.com/metadata.json"
```
This creates the master edition PDA and adds an additional instruction.

Note: Creating metadata usually requires the mint authority to sign; use `--allow-non-mint-authority` only if you know your mint setup supports it.

## Mint a Toll Pass (devnet/local)

Local:
```bash
solana-test-validator --reset
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npm -C solana run mint-toll-pass
```

Devnet:
```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json npm -C solana run mint-toll-pass
```

## Store a Route

Devnet:
```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json npm -C solana run set-route -- --name "example.dns" --dest "ipfs://bafy..."
```

Localnet (Docker validator):
```bash
docker run --rm -p 8899:8899 -p 8900:8900 solanalabs/solana:v1.18.20 solana-test-validator --reset --ledger /tmp/ledger
export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
export ANCHOR_WALLET=$HOME/.config/solana/id.json
solana config set --url http://127.0.0.1:8899
solana airdrop 5
anchor deploy
npm -C solana run set-route -- --name "local.dns" --dest "https://example.com"
```

Notes:
- `set-route` will **create** on first call and **update** on subsequent calls.
- Use `--update-only` to prevent accidental creation.
- Name record PDA seeds are derived from `sha256(name)` (not raw name bytes).

## Devnet MVP Flow (Routes + Witness + Toll Booth)

1) Configure devnet + wallet:
```bash
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/id.json
solana address
solana balance
```

2) Build + deploy:
```bash
export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"
anchor build
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
```

3) Mint a toll pass:
```bash
npm -C solana run mint-toll-pass -- --name "devnet-pass"
```

4) Run toll booth:
```bash
npm -C services/toll-booth install
npm -C services/toll-booth run dev
```

Edit `services/toll-booth/config/trusted_witnesses.json` to include witness pubkeys.

5) Create route locally + gather witnesses:
```bash
npm -C solana run route:create -- --name "example.dns" --dest "https://example.com" --ttl 300
npm -C solana run route:list
npm -C solana run route:sign-witness -- --route-id <ROUTE_ID> --keypair <witness1>
npm -C solana run route:sign-witness -- --route-id <ROUTE_ID> --keypair <witness2>
```

6) Submit + set on-chain:
```bash
npm -C solana run set-route -- --name "example.dns" --dest "https://example.com" --ttl 300
```

Notes:
- Creating a route requires quorum witnesses (default 2).
- Wallet cache is the source of truth; chain record is the public checkpoint.
- Mining credits are recorded by the toll booth (stub).
- Set `TOLL_BOOTH_URL` if your booth is not on `http://localhost:8787`.
- Use `--create-only` or `--update-only` to control record creation behavior.

## Deploy (devnet)
```bash
anchor deploy --provider.cluster devnet --provider.wallet ./devnet-wallet.json
```

## Test
```bash
npm install
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=/absolute/path/to/devnet-wallet.json
export DDNS_ANCHOR_PROGRAM_ID=ReplaceWithProgramId
anchor test --provider.cluster devnet --provider.wallet ./devnet-wallet.json
```

## Design 3 MVP (Stake + Cache-as-Witness + Quorum)

This is the “miners-first decentralization” path:

- wallets produce off-chain receipts when they observe resolutions
- a miner/verifier aggregates receipts off-chain
- canonical routes update on-chain only via quorum finalization (MVP: allowlisted miner)

Quickstart (devnet):

```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
npm install
anchor build

# init stake config + stake some SOL (once per devnet deployment)
npm run stake -- init
npm run stake -- stake --amount-sol 0.1

# start the miner witness daemon in another shell:
# cd /Users/root1/scripts/DECENTRALIZED-DNS-/services/miner-witness
# npm install
# BOOTSTRAP=1 MINER_KEYPAIR=~/.config/solana/id.json SOLANA_RPC_URL=https://api.devnet.solana.com npm run dev

# create + submit a receipt
npm run make-receipt -- --name example123.dns --dest https://example.com --ttl 300 --out /tmp/ddns-receipt.json
npm run submit-receipts -- --url http://localhost:8790 --in /tmp/ddns-receipt.json
```

Proof outputs (tx sigs, PDAs, hashes): see `/Users/root1/scripts/DECENTRALIZED-DNS-/services/miner-witness/VERIFIED.md`.

## Build status
Default build passes (no Metaplex CPI in-program).

## Domain Owner Rewards (MVP): ICANN NS Adoption + Revenue Share (ddns_rewards)

This module pays ICANN domain owners in TOLL for routing DNS queries through DDNS infrastructure.

MVP trust model (explicit):
- Domain verification (DNS TXT/HTTPS) is OFF-CHAIN and submitted by a centralized authority wallet.
- Usage aggregates are submitted by allowlisted verifier/miner wallets (off-chain verified).

### Build + deploy (devnet)

Note: initial program deploy requires enough SOL in the deploy wallet.

```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
anchor build
anchor deploy --provider.cluster devnet --program-name ddns_rewards
```

Confirm:

```bash
solana program show -u devnet 8GQJrUpNhCFodqKdhEvWub6pjTtgoXBtBZUqxeEDujAY
```

### Initialize RewardsConfig (once)

First, obtain the TOLL mint. If you use `ddns_stake` as the mint source:

```bash
npm -C solana run stake -- status
```

Then init `ddns_rewards`:

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=$HOME/.config/solana/id.json
npm -C solana run rewards -- init --toll-mint <TOLL_MINT_PUBKEY> --domain-share-bps 1500 --enabled=false --verifier <YOUR_WALLET_PUBKEY>
```

### Domain owner: start challenge

Run with the domain owner's wallet:

```bash
export ANCHOR_WALLET=/path/to/domain_owner.json
npm -C solana run rewards -- challenge --fqdn example.com
```

This prints:
- `nonce_hex`
- a TXT record name/value to publish (MVP)

### Authority: verify + claim domain (MVP centralized)

After verifying the TXT/HTTPS proof off-chain, the authority wallet submits `claim`:

```bash
export ANCHOR_WALLET=/path/to/authority.json
npm -C solana run rewards -- claim --fqdn example.com --nonce <nonce_hex> --owner-wallet <DOMAIN_OWNER_PUBKEY> --payout-ata <DOMAIN_OWNER_TOLL_ATA>
```

### User: pay a toll with revenue share

The payer wallet must hold TOLL tokens.

```bash
export ANCHOR_WALLET=/path/to/payer.json
npm -C solana run rewards -- pay --amount 1000000000 --fqdn example.com
```

This transfers:
- `domain_share_bps` of `amount` to the verified domain owner's payout token account
- remainder to the protocol treasury vault

## NS/DoH Operator Registry (MVP): Operator Marketplace Bootstrap (ddns_operators)

This module starts decentralizing DNS infrastructure itself by paying independent operators for running:
- DoH gateways
- Authoritative NS endpoints

MVP trust model (explicit):
- Epoch metrics are submitted by allowlisted watcher/miner wallets.
- On-chain does not verify per-query proofs in MVP; `metrics_root` is a commitment for auditability.

Localnet verification:

```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
anchor test --provider.cluster localnet
```

Devnet deploy (once wallet has sufficient SOL):

```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
anchor build
anchor deploy --provider.cluster devnet --program-name ddns_operators
```

CLI (after `anchor build` so IDL exists):

```bash
# init config + treasury vault (needs a TOLL mint)
npm -C solana run operators -- init --toll-mint <TOLL_MINT_PUBKEY> --submitter <WATCHER_PUBKEY> --enabled=true

# register operator + stake
npm -C solana run operators -- register --payout-ata <OPERATOR_TOLL_ATA> --endpoint doh:<SHA256_URL_HEX>
npm -C solana run operators -- stake --amount-lamports 200000

# allowlisted watcher submits metrics for current epoch
npm -C solana run operators -- metrics-submit --operator-wallet <OPERATOR_WALLET> --epoch-id <EPOCH_ID> --paid-query-count 10 --receipt-count 0

# operator claims rewards
npm -C solana run operators -- claim --epoch-id <EPOCH_ID> --payout-ata <OPERATOR_TOLL_ATA>
```
