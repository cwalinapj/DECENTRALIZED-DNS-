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

## Build status
Default build passes (no Metaplex CPI in-program).
