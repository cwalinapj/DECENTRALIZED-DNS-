# Node Agent (MVP)

## Purpose
Background worker that caches registry/proofs, verifies signatures, and submits receipts to the credits coordinator.

## Safety defaults
- Only serves protocol data by default.
- `.tor` and proxy-chain require explicit opt-in:
  - `ALLOW_TOR=1`
  - `ALLOW_PROXY_CHAIN=1`

## Basic usage
```bash
npm install
npm run build
node dist/agent.js
```

## Receipt flow
- Build receipt with `createReceipt`.
- Submit to coordinator `POST /receipts`.

## Notes
This is a minimal stub for desktop/mobile/extension integrations. Persisted cache and full task scheduler will be added later.
