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
Expected behavior:
- strict mode (default) fails unless demo-critical devnet programs are actually deployed
- optional fallback mode requires explicit opt-in:
```bash
ALLOW_LOCAL_FALLBACK=1 DDNS_SKIP_DEPLOY_VERIFY=1 bash scripts/devnet_happy_path.sh
```
- fallback mode prints `DEMO MODE: LOCAL FALLBACK` loudly

## Miner onboarding
- Cloudflare worker miner docs: `/Users/root1/DECENTRALIZED-DNS-/docs/MINER_QUICKSTART_CF.md`
- Onboarding page: `/Users/root1/DECENTRALIZED-DNS-/docs/miner-onboard/index.html`

## Where proof lives
- `/Users/root1/DECENTRALIZED-DNS-/VERIFIED.md`
- `/Users/root1/DECENTRALIZED-DNS-/docs/DEVNET_RUNBOOK.md`
- `/Users/root1/DECENTRALIZED-DNS-/docs/DEVNET_STATUS.md`
- `/Users/root1/DECENTRALIZED-DNS-/artifacts/devnet_inventory.json`

## One-line MVP definition
"MVP is ready when a stranger can run `npm run mvp:demo:devnet` from a clean checkout and it ends with `✅ demo complete`, and main has no CI errors and no open PRs."
