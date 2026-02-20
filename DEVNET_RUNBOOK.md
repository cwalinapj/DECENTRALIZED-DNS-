# DEVNET_RUNBOOK

This runbook is the copy/paste strict funded flow for MVP.

## Environment
- RPC: `https://api.devnet.solana.com`
- Authority wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`

## 1) Preflight

```bash
solana config set -u https://api.devnet.solana.com
solana address
solana balance
```

Expected:
- wallet is the intended signer
- balance is at/above `TOP_UP_TARGET_SOL` reported by deploy wave

## 2) Program ID sync gate

```bash
bash scripts/check_program_id_sync.sh
```

Expected:
- `Program ID sync check: PASS`

## 3) Strict funded flow (single command)

```bash
npm run mvp:demo:devnet
```

What it runs:
- deploy-wave preflight (and deploy only missing demo-critical programs)
- devnet inventory snapshot
- strict demo with `ALLOW_LOCAL_FALLBACK=0`

Expected final markers:
- `✅ demo complete`
- `✅ STRICT DEMO COMPLETE (ON-CHAIN)`

If underfunded, it exits with a shortfall report and `proof_bundle:` path.

## 4) Inventory proof

```bash
bash scripts/devnet_inventory.sh
```

Expected:
- writes `artifacts/devnet_inventory.json`
- writes `artifacts/devnet_inventory.md`
- prints wallet/program summary and required-vs-optional status

## 5) Optional direct gateway checks

```bash
PORT=8054 npm -C gateway run start
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
```
