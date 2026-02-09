# Design 3 End State: Miners-First Decentralized `.dns`

**This doc contains:** [MVP ✅] [End State 🔮]

**MVP**: centralized pieces still exist (gateway availability, allowlisted miners).  
**End State**: fully decentralized quorum + stake-weighted witnesses + optional IPFS receipt batches.

This document describes the end-product vision. Miners/verifiers get the full decentralized stack first; everyday users get a minimal client that still verifies canonical state.

## 1) End-State Objectives

- Censorship resistance: no single operator can block or rewrite `.dns` routes.
- Quorum-based canonical routes with stake-weighted witness receipts.
- Verifiable clients: canonical truth is on-chain and independently checkable.
- Fast propagation without trust: miners provide feeds/reconciliation as an optimization.
- Private-by-default user cache participation (future).

## 2) Miners-First Product Path

Miners run:

- Receipt ingestion + verification (off-chain)
- Aggregation (Merkle roots, stake-weighted support, dedupe)
- On-chain quorum submission + canonical finalization
- Low-latency update feeds and reconciliation APIs
- Audit/challenge tooling (serve receipts/roots when needed)

Rewards:

- Miners earn the majority of rewards for heavy lifting + uptime.
- Invalid aggregates become slashable later (fraud proofs / equivocation proofs).

## 3) Everyday User Path (Lightweight)

User client (wallet/plugin):

- cache-first resolution
- periodic on-chain verification on refresh
- mostly passive receipt emission
- optional low/auto stake to earn rewards and fund tolls.

Goal: “DNS just works,” while remaining verifiable and gateway-independent.

## 4) DYDNS per NFT (Future)

Not implemented in MVP. Planned direction:

- Passport NFT anchors a user identity for cache participation.
- Add a future `dyndns_hint` field (pubkey/relay/encrypted rendezvous hint).
- Wallet/plugin can expose a local resolver endpoint backed by user cache.

## 5) IPFS Backups (Future)

Not implemented in MVP. Planned direction:

- Wallet snapshots cache to an IPFS CAR file.
- On-chain pointer account stores `(wallet, epoch) -> (CID, size, signature)`.
- Miners sample-verify availability/integrity.

## 6) Governance / Upgrades

Goal: parameter evolution without a single censor.

- Config changes controlled by governance with timelocks and epoch-boundary activation.
- Verifier selection moves from allowlist to rotating stake-weighted committees.
- Slashing and challenge windows enforce honest aggregation.

## 7) End State: Trust-Minimized Adoption Flywheel

End-state goal: adoption incentives remain strong while reducing trust in any one actor.

Domain owner payouts (direction):

- payouts can be backed by stake-weighted quorum and/or witness-backed auditability
- miners/verifiers commit receipt batch roots and can be challenged in-window
- provably fraudulent aggregates become slashable (future)

Witness receipts (direction):

- gateways/operators publish witness batches (e.g., IPFS) with deterministic roots
- clients and third parties can sample-verify and audit (no user identifiers)

Still end-state (not MVP):

- DYDNS per NFT + local DoH endpoint
- IPFS cache snapshots per identity

---

Boxed callout:

**MVP**: allowlisted miners and centralized gateway/tollbooth are acceptable bootstrap trust points.  
**End State**: multi-party attestations + stake-weighted quorum + slashing reduce censorship risk without tracking users.
