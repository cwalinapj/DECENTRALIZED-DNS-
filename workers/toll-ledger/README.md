# Toll Ledger Worker (Scaffold)

Tracks wallet credit balances for toll access.

## Rules
- Credits can only be added via:
  - Native token burn (rate TBD).
  - High-trust aged NFT faucet rewards.
- Credits are decremented per request at the toll gate.

## Run
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/workers/toll-ledger
npm install
npm run build
node dist/index.js
```
