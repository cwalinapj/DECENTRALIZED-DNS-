# STATUS (Never Lies)

Last updated: 2026-02-09

This file is intentionally short and factual. Update it whenever devnet/local behavior changes.

## Devnet

Status:

- Design 3 (Cache-as-Witness + Staking + Quorum): Working ✅ (requires PR2 + PR3 merged)
- Passport/TollPass + per-wallet RouteRecord: Working ✅ (existing MVP flow)

Program IDs (devnet, verified 2026-02-09):

- `ddns_anchor`: `9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes`
- `ddns_registry`: `5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx`
- `ddns_quorum`: `9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB`
- `ddns_stake`: `6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF`

Verified flows:

- Design 3 canonical route finalization:
  - Proof outputs (tx sigs, PDAs, hashes): `services/miner-witness/VERIFIED.md` (lands in PR3)
  - Quickstart: `solana/README.md` + `services/miner-witness/README.md` (PR3)

## Localnet

Status:

- Optional / not the reference ❌
- Reason: devnet is the reference environment; localnet automation and end-to-end scripts may lag behind devnet changes.

## Firefox Extension

Status:

- Not started ❌ (MVP uses CLI/scripts + services)

## Centralization Points (MVP Bootstrap)

- Allowlisted verifier/miner set (Design 3 MVP): aggregates + finalizes; receipt verification is off-chain.
- Gateway/tollbooth services: convenience layer for resolution + writes.
- Clients can always verify canonical state by reading Solana accounts directly.

