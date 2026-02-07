# 01 — Architecture Overview (DECENTRALIZED-DNS / TollDNS)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

This document describes the high-level architecture of TollDNS: a **paid recursive DNS (DoH/DoT)** plus a distributed network of **edge/gateway/caching operators** (“miners”), coordinated by an **L2 control plane** with immutable policy and automatic fallback.

---

## System at a Glance

TollDNS has five major layers:

1) **Client** (phone/desktop/router)  
2) **Edge / Miner network** (ingress, gateways, caches)  
3) **Core resolvers** (paid recursive DoH/DoT)  
4) **Watchdogs / verifiers** (health + conformance attestations)  
5) **L2 control plane** (escrow, governance stake, registries, settlement, policy)

---

## Components

### 1) Client (Phone / Desktop / Router)

The client provides:
- a **local DNS stub** (intercepts system DNS and forwards via DoH/DoT)
- a **wallet** used for DNS tolls (via spend escrow)
- client-side policy controls:
  - spend limits
  - allow/deny lists
  - emergency stop
  - privacy/telemetry settings
- optional namespace handling (web3 names) and caching

**Primary responsibilities**
- maintain a **spend escrow balance** (prepaid; no per-query prompts)
- attach **signed payment vouchers** to DNS requests
- enforce local safety policy (rate/spend limits, allowlists)

---

### 2) Miner Network (Edge / Gateways / Caches)

Miners provide always-on infrastructure such as:

- **EDGE-INGRESS**: accepts client DoH/DoT traffic and applies “toll booth” admission controls  
- **GATEWAY**: resolves web3/IPFS-style pointers and serves content where applicable  
- **CACHE**: stores hot RRsets and validated pointer data; optionally content caches  
- Optional: **ANYCAST-INGRESS** where operators can support it  
- Optional: **SCRUBBING** (DDoS filtering capacity; specialized operators)

**Miner rewards**
- paid primarily for **delivered service** (proof-of-serving)
- further weighted by performance, uptime, tail latency, and correctness
- governed by regional quotas and diversity constraints

---

### 3) Core Resolver Layer (Paid Recursive DoH/DoT)

Core resolvers are responsible for:
- receiving DoH/DoT queries
- validating vouchers (cheap signature checks + sequence rules)
- performing recursion and validation (DNSSEC policy as defined)
- selecting gateway/cache targets when needed
- recording **service receipts** for miner payouts
- batch-settling payments on the L2

**Bootstrapping mode**
Early on, resolvers may forward web2 recursion to upstream recursive DNS providers (e.g., Cloudflare/Google) for reliability and to learn hot caching targets, then transition toward upstream quorum checks and more native recursion over time.

---

### 4) Watchdogs / Verifier Network

A distributed set of verifiers continuously measure:
- backend health (availability, latency buckets, error classes)
- conformance/equivalence checks (bounded challenge sets)
- incident signals (multi-backend degradation)

Verifiers publish signed reports. The chain enforces an immutable state machine that:
- degrades/disables unhealthy backends
- shifts routing to fallbacks
- triggers “attack mode” policies where necessary

See:
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence proofs: `docs/04-functional-equivalence-proofs.md`

---

### 5) L2 Control Plane (Token + Policy + Settlement)

The L2 is the **accounting and policy layer**, not the data plane. It provides:
- token accounting
- **spend escrow** for users (prepaid tolls)
- **DAO Governance Stake Pool** (time-locked; not instantly withdrawable)
- miner/gateway registries
- rewards distribution and settlement
- immutable policy contracts (watchdogs → routing policy updates)
- governance mechanisms for listing/delisting and parameter updates

---

## Data Plane vs Control Plane

### Data Plane (Fast Path)
- DNS queries over DoH/DoT
- gateway retrieval and serving
- cache hits and edge routing
- admission gating (“toll booth”)

**Rule:** no per-query chain interactions.

### Control Plane (Slow Path)
- escrow deposits/withdrawals (users)
- batch settlements (resolver pays miners)
- registry updates (miners/gateways/backends)
- policy updates driven by watchdog attestations

---

## End-to-End Flow (High-Level)

1) **User device** asks local stub for DNS resolution.
2) **Client stub** forwards query via DoH/DoT to a resolver (or edge ingress) with a **signed voucher**.
3) **Ingress / resolver** validates admission (toll booth) and voucher.
4) Resolver performs:
   - web2 recursion (native or upstream-forwarded), OR
   - routes to a miner gateway/cache for web3/pointer resolution
5) Miner returns response + a **service receipt**.
6) Resolver returns DNS response to client.
7) Resolver periodically **batch settles** voucher totals and miner payouts on the L2.

---

## Routing and Backend Selection

Routing is governed by:
- backend capability requirements (web2 recursion vs gateway vs cache)
- region preference and measured latency
- regional quotas and diversity constraints (avoid centralization)
- backend health state (Healthy/Degraded/Disabled/Recovering)
- attack-mode policy (cache-first, reduced recursion for suspicious patterns)

(See `docs/07-routing-engine.md` or `docs/routing-algorithm.md`.)

---

## “Toll Booth” Admission (DDoS Hardening Concept)

Before performing expensive work (recursion, heavy parsing, long upstream fetches), ingress nodes should be able to:
- reject unpaid/unauthenticated traffic cheaply
- use stateless challenge tokens or QUIC retry patterns
- prefer session resumption/keep-alive to reduce handshake costs

Note: this does not eliminate volumetric bandwidth saturation risk by itself; resilience also requires distribution, multi-provider presence, and many edges.

---

## Extensibility: Adapters and Gateways

TollDNS integrates existing networks via a standard adapter interface (examples):
- ENS: https://github.com/ensdomains
- SNS/Bonfida: https://github.com/Bonfida and https://github.com/SolanaNameService/sns-sdk
- Unstoppable: https://github.com/unstoppabledomains/resolution
- Handshake: https://github.com/handshake-org and https://github.com/handshake-org/hnsd
- PKDNS/PKARR: https://github.com/pubky/pkdns and https://github.com/pubky/pkarr
- IPFS: https://github.com/ipfs
- Filecoin: https://github.com/filecoin-project
- Arweave: https://github.com/arweaveteam

See: `docs/02-resolution-backends.md`

---

## Next Docs

- Vision: `docs/00-vision.md`
- Resolution backends: `docs/02-resolution-backends.md`
- Watchdogs + fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence proofs: `docs/04-functional-equivalence-proofs.md`
- Tokenomics: `docs/05-tokenomics.md`
