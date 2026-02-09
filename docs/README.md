# Docs Index

This folder mixes long-form concept docs with the Design 3 `.dns` MVP/end-state pathway.

## Canonical Docs
- `MVP.md` / `PROTOCOL_CACHE_WITNESS.md` / `END_STATE.md` (Design 3: `.dns`)
- `05-tokenomics.md`
- `THREAT_MODEL.md` (threats + mitigations)
- `ATTACK_MODE.md` (degradation rules + thresholds)
- `ops/` (deployment + runbooks)
- `specs/` (API/spec references)

## Start Here (Design 3)

- `MVP.md` (what is shippable today; what is centralized vs decentralized)
- `PROTOCOL_CACHE_WITNESS.md` (engineer-facing receipt/quorum spec)
- `END_STATE.md` (end-product roadmap; explicitly not implemented yet)

## Current Devnet / Local Instructions

Solana programs + scripts live under:

- `../solana/README.md`
- `../solana/scripts/` (mint toll pass, set route, witness signing)

MVP tollbooth service lives under:

- `../services/toll-booth/README.md`

## Where Code Lives

- On-chain programs: `../solana/programs/`
  - `ddns_anchor` (current MVP passport + name records)
  - `ddns_registry`, `ddns_quorum`, `ddns_stake` (Design 3 MVP building blocks)
- TS scripts: `../solana/scripts/`
- MVP service: `../services/toll-booth/src/index.ts`

## Glossary

- Route: `name_hash -> dest_hash` (+ `ttl`)
- Receipt: client-signed witness statement that a route was observed
- Quorum: rule for accepting a canonical route change (min receipts + stake-weight)
- Stake: locked value that weights receipts and earns rewards
- Toll: fee to propose/accelerate updates (MVP: can be service-mediated)
- Passport/TollPass: NFT identity used for anti-sybil gating (MVP bootstrap)
