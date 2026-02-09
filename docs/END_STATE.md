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

Goal:

- Incentivize ICANN domain owners to delegate NS to DDNS infra by paying usage-based rewards in TOLL.

Claim flow (wallet-signed):

- `claim(domain, wallet, ns_set, nonce, signature)`
- signature covers `DDNS_NS_CLAIM_V1 || domain || ns_set_hash || claim_id`

Proof of control (MVP: off-chain verification by miners):

1) DNS TXT proof (most DNS-native)
- user publishes TXT at `_ddns-claim.<domain>` containing `claim_id` (or a signed blob)
2) HTTPS proof
- user hosts `https://<domain>/.well-known/ddns-claim` containing `claim_id` + signature

Proof of delegation:

- miners verify the live NS set for `<domain>` matches the required DDNS `ns_set`
- miners require it stays delegated for a minimum window (e.g. 7 days) to prevent flip-flopping

Rewards (usage-based):

- paid per domain DNS query (not flat per epoch)
- miners aggregate query receipts into `(domain_hash, epoch_id) -> query_count` and commit a `receipts_root`
- rewards per epoch:
  - `epoch_reward = min(max_reward_per_epoch, query_count * reward_per_query)`

Anti-sybil / anti-fraud (MVP → end state):

- MVP: allowlisted verifiers/miners; manual approval or caps per wallet
- Later: stake-to-claim (and stake-weighted verifier sets), slashing for fraudulent attestations, and multi-source sampling

Trust model:

- MVP: DNS/HTTP proof checks and query receipt verification happen off-chain by allowlisted miners; on-chain stores only attestations + usage aggregates.
- End state: stake-weighted verifier committees and (optionally) on-chain or zk verification of committed proofs.
