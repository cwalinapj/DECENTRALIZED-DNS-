# Docs Index

## Start Here (MVP vs End State)

- **MVP (what works today):** `docs/MVP.md`
- **Protocol (engineer spec):** `docs/PROTOCOL_CACHE_WITNESS.md`
- **End state (miners-first decentralization):** `docs/END_STATE.md`
- **Adoption wedge (incentives):** `docs/ADOPTION.md`
- **Status (never lies):** `docs/STATUS.md`

## Where Code Lives

- On-chain (Anchor workspace): `solana/`
- Tollbooth / gateway services (bootstrap): `services/`
- Miner/verifier services (lands in PR3): `services/miner-witness/`
- Protocol and system specs: `specs/`

## Glossary (MVP terminology)

- **toll event:** a paid route acquisition / refresh; the payment surface in MVP (not per DNS query).
- **witness receipt:** privacy-safe statement about an answer (no client identifiers; bucketed timestamps).
- **miner/verifier:** allowlisted in MVP; verifies off-chain receipts and posts on-chain aggregates.
- **domain owner rewards split:** bps split of a toll event between domain owner / miners / treasury.
