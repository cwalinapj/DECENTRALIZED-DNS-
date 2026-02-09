# Design 3 End State: Miners-First Decentralized `.dns`

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

## 7) Nameserver Delegation Incentives (ICANN domains)

Goal: incentivize ICANN domain owners to point NS to DDNS infra and get paid in TOLL, without trusting a single gateway.

MVP bootstrap (implemented now):
- `ddns_rewards` provides on-chain state for `DomainClaim` + revenue share on paid tolls.
- Domain control verification (TXT/HTTPS) and usage aggregation are OFF-CHAIN and submitted by allowlisted actors.

End-state direction (not implemented yet):
- multiple independent verifiers/oracles attest domain control + NS delegation over a time window
- stake-weighted attestors, rotation, and slashing for provably false attestations
- optional on-chain commitments to receipt sets (Merkle/zk) for auditability
- client multi-gateway resolution where gateway speed is an optimization, not a trust anchor

## 8) NS/DoH Operator Marketplace (Infrastructure Decentralization)

Goal: decentralize the authoritative NS and DoH gateway layers by paying many independent operators in TOLL based on demand and performance.

MVP bootstrap (implemented now):
- `ddns_operators` on-chain registry of operators + endpoints and allowlisted metric submissions per epoch.
- Rewards are paid from a treasury vault in TOLL; the heavy verification is OFF-CHAIN in MVP.

End-state direction (not implemented yet):
- permissionless operator onboarding (stake-based admission)
- stake-weighted metrics submitters and/or multi-party attestation of metrics
- slashing for provable fraud / downtime / equivocation
- on-chain verification of receipts via Merkle proofs or zk (optional)
