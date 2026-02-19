# Devnet Runbook

Canonical devnet runbook for MVP operations.

## RPC + wallet
```bash
solana config set -u https://api.devnet.solana.com
solana address
solana balance
```

## Program inventory + rent/top-up
```bash
bash scripts/devnet_inventory.sh
```

## MVP demo
```bash
npm run mvp:demo:devnet
```
Expected terminal marker:
- `✅ demo complete`

Note:
- Current `.dns` route assignment can still report tollbooth flow blockers depending on existing devnet passport/name state. ICANN resolve + full demo flow still complete and exit 0.

## Proof artifacts
- `/Users/root1/DECENTRALIZED-DNS-/VERIFIED.md`
- `/Users/root1/DECENTRALIZED-DNS-/docs/DEVNET_STATUS.md`
- `/Users/root1/DECENTRALIZED-DNS-/artifacts/devnet_inventory.json`
