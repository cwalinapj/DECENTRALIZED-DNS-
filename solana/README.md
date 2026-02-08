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

## Client-side Metadata (one command)
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
