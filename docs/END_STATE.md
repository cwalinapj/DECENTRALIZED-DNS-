# Design 3 End State: Miners-First Decentralized `.dns`

> This doc contains: [MVP ✅] [End-State 🔮]
>
> Everything here is End-State 🔮 (planned) unless explicitly called out as already shipped in MVP docs.

This document describes the end-product vision. Miners/verifiers get the full decentralized stack first; everyday users get a minimal client that still verifies canonical state.

## 1) End-State Objectives

- Censorship resistance: no single operator can block or rewrite `.dns` routes.
- Quorum-based canonical routes with stake-weighted witness receipts.
- Verifiable clients: canonical truth is on-chain and independently checkable.
- Fast propagation without trust: miners provide feeds/reconciliation as an optimization.
- Private-by-default user cache participation (future).

## 2) Miners-First Product Path

Miners run:

- receipt ingestion + verification (off-chain initially; later verifiable)
- aggregation (Merkle roots, stake-weighted support, dedupe)
- on-chain quorum submission + canonical finalization
- low-latency update feeds and reconciliation APIs
- audit/challenge tooling (serve receipts/roots when needed)

Rewards direction:

- miners earn the majority of rewards for heavy lifting + uptime
- invalid aggregates become slashable later (fraud proofs / equivocation proofs)

## 3) Everyday User Path (Lightweight)

User client (wallet/plugin):

- cache-first resolution
- periodic on-chain verification on refresh
- mostly passive receipt emission
- optional low/auto stake to earn rewards and fund tolls

Goal: “DNS just works,” while remaining verifiable and gateway-independent.

## 4) DYDNS per NFT (Future)

Not implemented in MVP. Planned direction:

- Passport NFT anchors a user identity for cache participation.
- Add a future `dyndns_hint` field (pubkey/relay/encrypted rendezvous hint).
- Wallet/plugin can expose a local resolver endpoint backed by user cache.

## 5) IPFS Backups (Future)

Not implemented in MVP. Planned direction:

- wallet snapshots cache to an IPFS CAR file
- on-chain pointer account stores `(wallet, epoch) -> (CID, size, signature)`
- miners sample-verify availability/integrity

## 6) Governance / Upgrades

Goal: parameter evolution without a single censor.

- config changes controlled by governance with timelocks and epoch-boundary activation
- verifier selection moves from allowlist to rotating stake-weighted committees
- slashing and dispute windows enforce honest aggregation

## 7) Trust-Minimized Adoption Flywheel (End State)

End-state goal: strong adoption incentives while reducing trust in any single actor.

Domain owner payouts (direction):

- payouts backed by stake-weighted quorum and/or witness-backed auditability
- miners/verifiers commit receipt batch roots and can be challenged within dispute windows
- provably fraudulent aggregates become slashable

Witness receipts (direction):

- gateways/operators publish witness batches (e.g., IPFS) with deterministic roots
- third parties can sample-verify and audit without user identifiers

## 8) End-State: Permissionless Watchdogs + Dispute-Backed Policy

Not fully implemented. Roadmap:

1. Signed attestations accepted on-chain
   - `submit_attestation_signed(payload_bytes, sig)` verifies ed25519 on-chain
   - payload format is fixed and versioned
2. Permissionless watchdog set
   - watchdogs register by staking and meeting performance criteria
   - reputations are computed from historical correctness and availability
3. Dispute windows + slashing
   - incorrect attestations can be challenged with evidence
   - slashing/jailing for provably false or malicious behavior
4. Stake-weighted / reputation-weighted thresholds
   - policy transitions require quorum by stake-weight or reputation-weight (not allowlists)

Policy outputs remain compact routing hints:

- OK / WARN / QUARANTINE
- TTL caps and penalty signals

See:

- `docs/PROTOCOL_WATCHDOG_ATTESTATION.md`

