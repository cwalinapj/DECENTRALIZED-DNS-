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
# Localnet (recommended for tests):
anchor test --provider.cluster localnet

# Devnet (only if you intend to deploy during tests):
# export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
# export ANCHOR_WALLET=/absolute/path/to/devnet-wallet.json
# anchor test --provider.cluster devnet --provider.wallet ./devnet-wallet.json
```

## Surfpool (mainnet-like local emulation across all programs)

This workspace includes a Surfpool wiring path that auto-loads every program listed under `[programs.localnet]` in `Anchor.toml`.

```bash
# See full wired program set (fails if any solana/programs/* dir is missing from Anchor.toml)
npm run surfpool:plan

# Preview build/deploy order without starting Surfpool
DRY_RUN=1 npm run surfpool:emulate-mainnet

# Execute full local emulation against Surfpool (mainnet datasource, local deploy)
npm run surfpool:emulate-mainnet
```

More detail: `docs/SURFPOOL_MAINNET_EMULATION.md`

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

## Nameserver Delegation Incentives (ICANN domains) (WIP)

This module is not part of the `.dns` MVP flow yet. It is an incentive module to pay domain owners usage-based rewards in TOLL when they delegate their ICANN domain NS to DDNS infrastructure.

Scripts:

- `npm -C solana run ns:claim -- init-config ...`
- `npm -C solana run ns:claim -- create --domain example.com`
- `npm -C solana run ns:attest -- --domain example.com --control-proof-hash <hex32>`
- `npm -C solana run ns:usage -- --domain example.com --query-count 1000 --receipts-root <hex32>`
- `npm -C solana run ns:claim -- claim-rewards --domain example.com --from-epoch <n> --to-epoch <n> --toll-mint <MINT>`

## Build status
Default build passes (no Metaplex CPI in-program).

## Witness Rewards (MVP DoD)

Program:
- `ddns_witness_rewards` (`AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge`)

Compile checks:

```bash
cd solana
cargo check -p ddns_witness_rewards
anchor build --program-name ddns_witness_rewards
cargo test -p ddns_witness_rewards
```

Minimal status CLI:

```bash
npm -C solana run witness-rewards -- status \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --miner <MINER_PUBKEY>
```

## Escrow + Toll Vouchers (MVP)

This is the on-chain split payout path for **toll events** (route acquisition), not per-query payments.

1) Build IDLs:

```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
npm install
anchor build
```

2) Init escrow config (split bps + allowlisted voucher signer):

```bash
npm -C solana run escrow:init -- \
  --toll-mint <TOLL_MINT_PUBKEY> \
  --domain-bps 1000 --miners-bps 2000 --treasury-bps 7000 \
  --allowlisted-signer <TOLLBOOTH_SIGNER_PUBKEY>
```

3) User: create escrow vault + deposit TOLL:

```bash
npm -C solana run escrow:deposit -- --toll-mint <TOLL_MINT_PUBKEY> --amount <U64_BASE_UNITS>
```

4) Domain owner: register a payout token account for a `.dns` name_hash:

```bash
npm -C solana run domain:register -- --name example.dns --toll-mint <TOLL_MINT_PUBKEY>
```

5) Tollbooth (allowlisted signer): issue a voucher; anyone can redeem it:

```bash
npm -C solana run voucher:issue-toll -- \
  --payer <USER_WALLET_PUBKEY> --name example.dns --amount <U64_BASE_UNITS> \
  --mint <TOLL_MINT_PUBKEY> --nonce 1 --signer-keypair <KEYPAIR_JSON>

npm -C solana run voucher:redeem-toll -- \
  --voucher <voucher_json_or_base64> --sig <signature_base64> --signer <TOLLBOOTH_SIGNER_PUBKEY>
```

Spec: `/Users/root1/scripts/DECENTRALIZED-DNS-/docs/ESCROW_VOUCHERS.md`
