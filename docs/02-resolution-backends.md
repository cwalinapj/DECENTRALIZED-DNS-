# 02 — Resolution Backends (Composable DNS + Web3 + Storage Networks)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

TollDNS is designed as a **composable resolution layer**: it can resolve names and content pointers using multiple existing protocols and networks. This reduces development scope, increases resilience, and avoids placing total trust in any single provider or ecosystem.

This document describes:

- which backends can be integrated,
- what they contribute to resilience,
- where they run (client / resolver / miner),
- how TollDNS fails over safely,
- and how **gateway tolling** works when a partner does not want “subdomain routing cache” usage.

Related:

- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Tokenomics: `docs/05-tokenomics.md`
- Routing engine: `docs/07-routing-engine.md`
- Backend adapter spec: `specs/backend-interface.md`

---

## Why Multiple Backends

A resilient “decentralized Cloudflare” must survive:

- targeted outages on centralized providers,
- policy/regulatory pressure concentrated on single organizations,
- single-ASN/cloud correlated failures,
- failures inside any single decentralized protocol.

Therefore TollDNS supports **multiple independent backends** and can automatically re-route when one degrades via watchdog-driven policy state.

---

## Where Backends Run

Backends may execute in three places:

- **Client (apps / extensions)**  
  Best for UX, privacy, and direct integration with browsers and user agents.

- **Resolver (DoH/DoT edge)**  
  Best for performance, caching, policy enforcement, and consistent behavior.

- **Miner / Edge Operator (gateway + cache + ingress)**  
  Best for distributed gateway retrieval, caching, and resilience footprint.

A single backend may be supported in multiple places.

---

## Backend Categories

### 1) Standard DNS (ICANN / Web2)

**Purpose:** Resolve traditional Web2 domains.

**Implementation:** Recursive resolver over DoH/DoT with aggressive caching.

**Bootstrapping strategy**

- Early phase: prefer forwarding to established upstream recursors for baseline reliability and to learn “hot” caching targets.
- Next: enable upstream **quorum mode** (N-of-M agreement) for correctness cross-checking and safer cache population.
- Later: progressively increase native recursion share while keeping upstream as fallback and cross-check.

**Fallback**

- upstream recursors (e.g., Cloudflare/Google/etc.)
- cache-first / cache-only behavior under incident conditions

Where it runs:

- Resolver (primary)
- Miner edges (optional, as ingress/caching expands)

Adapter(s):

- `/adapters/dns-icann/`
- `/adapters/dns-upstream-quorum/`

---

### 2) Web3 Naming (name → records / content pointers)

**Purpose:** Resolve blockchain-based names to addresses, content hashes, and gateway targets.

Examples (integrations via adapters):

- ENS (Ethereum Name Service): <https://github.com/ensdomains>
- Solana Name Service (.sol) / Bonfida: <https://github.com/Bonfida>
- SNS SDK: <https://github.com/SolanaNameService/sns-sdk>
- Unstoppable Domains Resolution: <https://github.com/unstoppabledomains/resolution>

Where it runs:

- Client app/extension (best UX path)
- Resolver backend (server-side lookup)
- Miner gateways (content fetch + serving)

Fallbacks:

- cached resolution results (TTL-bounded, policy-controlled)
- temporary centralized RPC providers (bootstrap only, policy-tagged)
- temporary centralized content gateways (bootstrap only, policy-tagged)

Adapters:

- `/adapters/ens/`
- `/adapters/unstoppable/`
- `/adapters/solana-sns-bonfida/`

---

### 3) DHT / P2P Record Systems (DNS-like records in distributed substrate)

**Purpose:** Censorship-resistant records stored across a large distributed network.

Examples:

- PKDNS: <https://github.com/pubky/pkdns>
- PKARR: <https://github.com/pubky/pkarr>

Where it runs:

- Resolver and/or miner edge nodes (primary)
- Client optional (advanced mode)

Fallbacks:

- cache-only serving for bounded periods (if safe and policy allows)
- `UNAVAILABLE` for that namespace if backend is unhealthy/disabled by policy

Adapters:

- `/adapters/pkdns-pkarr/`

---

### 4) Alternate Root / TLD Layer

**Purpose:** Reduce reliance on the conventional root zone model by supporting alternative naming roots.

Example:

- Handshake: <https://github.com/handshake-org>
- hnsd resolver: <https://github.com/handshake-org/hnsd>

Where it runs:

- Resolver layer (and optionally miner edges)

Fallback:

- ICANN DNS baseline when alt-root is unhealthy, disabled, or unsupported by client policy

Adapters:

- `/adapters/handshake/`

---

### 5) Content Addressing + Storage Networks (Gateways)

**Purpose:** Fetch and serve content using decentralized storage and addressing.

Examples:

- IPFS: <https://github.com/ipfs>
- Filecoin: <https://github.com/filecoin-project>
- Arweave: <https://github.com/arweaveteam>

Where it runs:

- Miner gateways (primary)
- Resolver-owned gateway capacity (secondary)
- Client optional (direct retrieval in advanced mode)

Fallbacks:

- TollDNS-operated gateway capacity (temporary/secondary)
- centralized gateways (bootstrap only, policy-tagged)
- cache-only serving for previously retrieved objects (if safe and policy allows)

Adapters:

- `/adapters/ipfs/`
- `/adapters/filecoin/`
- `/adapters/arweave/`

---

## Gateway Tolls and Partner-Controlled Routing

### When Partners Don’t Want “Subdomain Routing Cache” Usage

Not all gateway operators want TollDNS to treat their gateway domain(s) as public routing/cache endpoints (e.g., by relying on a subdomain pattern for web routing). Some partners require that:

- traffic routed through their gateway is **metered**,
- usage is **paid** (or explicitly subsidized),
- and usage respects operator-defined policy (tier limits, geo limits, rate caps).

### 1) Per-Gateway Toll Schedules (Index Units)

TollDNS supports per-gateway toll schedules priced in **Index Units**:

- toll per request, per byte served, and/or compute tier
- differentiated by region, congestion, or request class
- can be **subsidized** by TollDNS for “free gateway” tiers

### 2) Operator Policy Constraints

Gateways may publish constraints that routing MUST honor:

- max QPS / bandwidth caps
- allowed client tiers (end user vs business vs developer)
- geo/region constraints
- namespace/content-class constraints (policy-governed)

### 3) Settlement and Payout

When TollDNS routes traffic through a third-party gateway:

- usage is measured via **proof-of-serving receipts**
- tolls are collected in Index Units (from user or subsidy pool)
- payouts to the gateway operator occur in native token (or configured asset) based on DAO policy

### 4) Alternate Routing When Partner Tolls Apply

If a partner gateway enforces tolling or rejects “subdomain cache routing,” TollDNS can route via:

- another decentralized gateway route,
- TollDNS-operated gateway capacity,
- or a centralized fallback path (policy-controlled)

This keeps the network resilient while respecting partner business models.

---

## Adapter Model (How Integration Works)

Each backend is integrated via an **Adapter** implementing the standard interface so TollDNS can:

- route queries consistently,
- apply watchdog policies uniformly,
- and compare conformance across backends.

Spec:

- `specs/backend-interface.md`

### Adapter Responsibilities

Adapters MUST:

- accept standardized resolution requests (name, qtype, namespace, region hints)
- return standardized DNS RRsets or a gateway resolution result (pointer + route list)
- provide deterministic conformance hooks for watchdog probes
- declare fallback mappings and capability declarations

---

## Backend Registry (On-Chain, Governance-Controlled)

Each backend has an on-chain registry record (or NFT-like immutable pointer) referencing expected behavior and immutable configs:

- `backend_id`
- `adapter_id` and version
- `policy_id` (watchdog thresholds + equivalence rules)
- `verifier_set_id`
- `fallback_backend_set_id`
- `conformance_profile_id`
- immutable content-hash pointers for configs/specs

This keeps integrations composable, auditable, and governance-controlled.

---

## Developer Gateways (Third-Party Adapters)

TollDNS supports third-party adapters and gateway operators:

- developers submit adapters for DAO review
- listed adapters can earn revenue based on routed traffic and proof-of-serving
- adapters can be degraded/delisted if they violate policy or fail conformance/health checks

See:

- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Tokenomics: `docs/05-tokenomics.md`

---

## Repo Layout (Adapters)

/adapters
dns-icann/
dns-upstream-quorum/
ens/
unstoppable/
solana-sns-bonfida/
handshake/
pkdns-pkarr/
ipfs/
filecoin/
arweave/
tor-odoH/              # optional, policy-controlled
