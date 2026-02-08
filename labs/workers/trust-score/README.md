# Trust Score Worker (Scaffold)

Computes off-chain trust scores and writes coarse metadata for IPFS publishing.

## Run
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/workers/trust-score
npm install
npm run build
node dist/index.js
```

## Notes
- Expects event inputs from receipts and voucher logs.
- Output should be coarse score bands and tier only.
- Publish via IPFS or a paid gateway.
