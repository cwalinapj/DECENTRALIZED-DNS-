# START_HERE

If you only read one file, read this one.

## Quickstart
📌 Canonical MVP command (devnet, strict): `npm run mvp:demo:devnet`

This runs the funded deploy-wave check, inventory, and strict on-chain demo end-to-end.

Latest successful proof snapshot: `/Users/root1/DECENTRALIZED-DNS-/docs/PROOF.md`

## What this repo is
TollDNS is a DNS + gateway MVP with:
- recursive ICANN resolution with quorum/audit metadata
- `.dns` route + resolve flow through Solana-backed tooling
- strict devnet proof scripts and inventory/audit outputs

## Canonical strict devnet demo

```bash
npm run mvp:demo:devnet
```

This command runs `scripts/devnet_when_funded.sh` and must end with:
- `✅ demo complete`
- `✅ STRICT DEMO COMPLETE (ON-CHAIN)`

If required programs are missing or wallet SOL is below target, it fails non-zero and prints top-up guidance.

## Copy/paste MVP path

```bash
npm ci && npm test
bash scripts/check_program_id_sync.sh
npm run mvp:demo:devnet
bash scripts/devnet_inventory.sh
```

Expected markers:
- test suite passes
- program ID sync gate passes
- strict demo completion markers appear
- inventory writes `artifacts/devnet_inventory.json`

## Miner onboarding
- Quickstart: `/Users/root1/DECENTRALIZED-DNS-/docs/MINER_QUICKSTART_CF.md`
- Onboarding UI: `/Users/root1/DECENTRALIZED-DNS-/docs/miner-onboard/index.html`

## Proof and status locations
- `/Users/root1/DECENTRALIZED-DNS-/VERIFIED.md`
- `/Users/root1/DECENTRALIZED-DNS-/DEVNET_RUNBOOK.md`
- `/Users/root1/DECENTRALIZED-DNS-/docs/DEVNET_STATUS.md`
- `/Users/root1/DECENTRALIZED-DNS-/artifacts/devnet_inventory.json`

## MVP definition
MVP is ready when a clean checkout can run `npm run mvp:demo:devnet` and finish strict on-chain with the success markers above.
