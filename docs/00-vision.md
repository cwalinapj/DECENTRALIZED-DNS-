# 00 — Vision (DECENTRALIZED-DNS / TollDNS)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

TollDNS is a concept for a **decentralized cloud-edge network** that starts with **paid recursive DNS (DoH/DoT)** and expands into a distributed fabric of **ingress, caching, and gateway operators**. The goal is to reduce systemic reliance on a small number of centralized edge providers by funding a resilient alternative with cryptoeconomic incentives and transparent governance.

---

## The Thesis

The modern internet increasingly depends on a small number of edge networks for:
- recursive DNS resolution
- DDoS absorption
- gateway/proxy access to content networks
- caching and performance optimization

This concentration creates a systemic risk:
- policy and regulatory pressure can be focused on a few entities
- outages and routing incidents can impact large portions of the internet
- trust bottlenecks emerge for critical infrastructure

**TollDNS** aims to build a “decentralized Cloudflare-like” network where capacity and routing decisions are distributed across many independent operators and networks.

---

## What We Are Building

### Phase 1: Paid Recursive DNS (the wedge)
- DoH/DoT resolvers that charge a small **toll per query**
- Users keep a local wallet and **prepay into spend escrow** so DNS usage is seamless (no per-query approval prompts)
- Micropayments happen off-chain (vouchers) and settle in batches on an L2

### Phase 2: Distributed Gateways + Edge Caching
- Miners provide:
  - gateway services (Web3/IPFS-like resolution and retrieval)
  - caching (hot records and content)
  - regional ingress capacity
- Tolls subsidize gateway capacity so end users can access gateways with predictable performance

### Phase 3: Resilient Edge Fabric (the “decentralized Cloudflare”)
- Regional quotas and diversity controls (avoid centralizing into one cloud/ASN)
- Anycast/edge ingress options where possible
- Attack-mode degradation strategies (cache-only, fallback routing, hardened admission)
- “Watchdogs” enforce automatic fallback to centralized services when needed

---

## Why A Toll?

The toll is not just monetization. It is also:
- **anti-abuse friction**: makes high-volume query abuse economically costly
- **infrastructure funding**: pays for gateways, edges, and operational resilience
- **security alignment**: pays providers for delivered work and provides a budget for defense

Important constraint:
- A toll cannot force attackers to pay for raw packet floods that saturate links.
- Therefore, resilience must also come from **distribution, diversity, and capacity** (not toll alone).

---

## Design Principles

### 1) Keep the blockchain out of the hot path
DNS must be fast. Per-query on-chain settlement is not realistic.
- Use **off-chain vouchers** + **batch settlement** on an L2

### 2) Separate “spend escrow” from “governance stake”
- **Spend escrow**: user prepayment for tolls (user convenience)
- **Governance stake**: time-locked accountability for operators

We explicitly avoid “refundable escrow staking” as a security mechanism, because it can be abused if an operator can stake, misbehave, and withdraw immediately. Security stake must be time-locked (and potentially slashable later).

### 3) Composable backends
Integrate existing networks instead of reinventing them:
- ENS: https://github.com/ensdomains
- SNS / Bonfida: https://github.com/Bonfida and https://github.com/SolanaNameService/sns-sdk
- Unstoppable: https://github.com/unstoppabledomains/resolution
- Handshake: https://github.com/handshake-org and https://github.com/handshake-org/hnsd
- PKDNS / PKARR: https://github.com/pubky/pkdns and https://github.com/pubky/pkarr
- IPFS: https://github.com/ipfs
- Filecoin: https://github.com/filecoin-project
- Arweave: https://github.com/arweaveteam

### 4) Automatic fallback is mandatory
Decentralized protocols can fail. The network must recover automatically.
- Watchdogs + quorum attestations + immutable on-chain policy
- Automatic fallback to centralized services (Cloudflare/Google/etc.) until recovery

### 5) Pay for delivered service
Reward miners and gateways based on **proof-of-serving**, performance, correctness, and availability—not on claimed capacity alone.

### 6) Governance must be explicit
A DAO governs:
- gateway listings and adapter approvals
- conformance profiles and watchdog thresholds
- routing weights / quotas / region buckets
- delisting/pausing unsafe or policy-violating gateways

---

## The “Internet Lifeboat” Goal

TollDNS is intended to be a viable option when centralized DNS/gateway infrastructure is degraded or attacked. Achieving this requires:
- many independent ingress points (“lots of edges”)
- multi-provider diversity (avoid correlated failure)
- hardened admission (“toll booth” gating)
- cache-first and degraded operation modes
- watchdog-driven automatic switching and recovery

---

## What Success Looks Like

A successful TollDNS network:
- resolves web2 normally with low latency
- resolves web3 names and content pointers through gateways reliably
- remains available under abuse and large-scale incidents via distribution and diversity
- is extensible: third-party developers can add new gateways/adapters and earn revenue
- is governable: unsafe backends can be degraded or delisted quickly and transparently

---

## Next Docs

- Resolution backends: `docs/02-resolution-backends.md`
- Watchdogs + fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence proofs: `docs/04-functional-equivalence-proofs.md`
- Tokenomics: `docs/05-tokenomics.md`
