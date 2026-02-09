# Review Checklist: Attack Mode PR Series

This checklist is for reviewers. It is written so each PR can be reviewed and merged independently.

## PR-A (Docs)
- Docs describe:
  - attack-mode state machine and triggers
  - degradation rules per component (gateway, miner, client)
  - explicit MVP trust assumptions (allowlists, off-chain verification).

## PR-B (Shared Module)
Build/test:
- `npm test` (or the repo’s CI test command)

Review:
- module exports a deterministic `evaluateAttackMode(prev, signals)` function
- thresholds are configurable via env vars
- unit tests cover mode transitions + hysteresis.

## PR-C (Miner Integration)
Build/test:
- `npm -C services/miner-witness test` (or service-level test command)

Smoke checks (after running miner):
- `GET /v1/health` includes current `attack_mode` and policy knobs
- with `ATTACK_MODE_ENABLED=1`, miner tightens receipt admission (document expected behavior).

## PR-D (Gateway + Tollbooth Integration)
Build/test:
- `npm -C gateway test`
- `npm -C services/toll-booth test` (or service-level test command)

Smoke checks:
- `GET /v1/attack-mode` returns `{ mode, reasons, policy }` on gateway
- `GET /v1/attack-mode` returns `{ mode, reasons, policy }` on tollbooth
- with `ATTACK_MODE_ENABLED=1`, write endpoints return a clear refusal:
  - expected HTTP: `403` or `409`
  - expected JSON keys: `error.code`, `error.message`, `mode`.

## PR-E (Client Scripts)
Build/test:
- `npm -C solana run <script> -- --help`

Smoke checks:
- on multi-RPC disagreement, scripts refuse writes and print:
  - disagreeing RPC URLs
  - account data hashes
  - active mode.

## Merge Order (Do Not Reorder)
PR-A -> PR-B -> PR-C -> PR-D -> PR-E

