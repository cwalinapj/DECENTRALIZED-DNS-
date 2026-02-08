# Solana Anchor Scaffold

This is a minimal Anchor program that initializes a config PDA and stores:
- admin pubkey
- version

## Build
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
anchor build
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
Current build fails due to Anchor CLI mismatch and spl-token-2022 dependency errors. See `docs/sections/solana.md`.
