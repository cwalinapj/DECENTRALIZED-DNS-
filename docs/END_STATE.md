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

- miners start with REP (reputation) and later earn stake-weighted economic rewards
- liquid token emissions are introduced only after strong anti-sybil cost-of-identity exists
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

Utility vs reputation in the end-state:

- `TOLL` remains the utility/payment token.
- `REP` becomes a durable signal for eligibility, governance influence, and fee discounts.
- REP-to-economic conversion stays constrained by slashing risk, stake, and proof quality.

## Bonded Hosting + K8s + Load Balancing (Roadmap)

This section is roadmap-only and not a claim of current MVP automation.

Prerequisite policy:
- DNS control is required for hosted resource tiers:
  - domains must point NS to DDNS and resolve via DDNS gateway stack to unlock hosting/load-balancing/CDN tiers.
  - non-participants can still use read-only API surfaces without hosted capacity allocation.

Anti-abuse and economic controls:
- Hosting capacity is escrow/bond-gated per premium primary domain.
- Bond scales with resource profile (sites, traffic, feature tier).
- Violations (spam/malware/churn abuse/policy breaches) trigger slashing and eligibility suspension.

Reliability model:
- ICANN name handling remains multi-upstream recursive with confidence/fallback mechanics.
- `.dns` remains canonical and policy-driven on-chain.
- End-state value is not "replace recursive DNS day 1"; it is adding economic coordination, auditability, and decentralized operator participation around it.

Tokenomics tie-in:
- Defi-liquid reward eligibility for mining/hosting is premium-and-bond gated.
- Free subdomain users still contribute privacy-safe observations and can receive limited REP/participation rewards.

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
