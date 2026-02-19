# Start Here

If you read one file, read this one.

## What this repo is
Decentralized DNS infrastructure with a gateway resolver, Solana programs, and devnet/operator tooling.

## MVP quick path
1. Install deps and run baseline:
```bash
npm ci && npm test
npm -C gateway test && npm -C gateway run build
```
2. Run devnet inventory:
```bash
bash scripts/devnet_inventory.sh
```
3. Run the MVP demo:
```bash
npm run mvp:demo:devnet
```
Expected marker:
- `✅ demo complete`

## Miner onboarding
- Cloudflare worker miner docs: `/Users/root1/DECENTRALIZED-DNS-/docs/MINER_QUICKSTART_CF.md`
- Onboarding page: `/Users/root1/DECENTRALIZED-DNS-/docs/miner-onboard/index.html`

## Where proof lives
- `/Users/root1/DECENTRALIZED-DNS-/VERIFIED.md`
- `/Users/root1/DECENTRALIZED-DNS-/docs/DEVNET_RUNBOOK.md`
- `/Users/root1/DECENTRALIZED-DNS-/docs/DEVNET_STATUS.md`

## One-line MVP definition
"MVP is ready when a stranger can run `npm run mvp:demo:devnet` from a clean checkout and it ends with `✅ demo complete`, and main has no CI errors and no open PRs."
