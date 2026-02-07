# 02 — Resolution Backends (Composable DNS + Web3 + Storage Networks)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

TollDNS is designed as a **composable resolution layer**: it can resolve names and content pointers using multiple existing protocols and networks. This reduces development scope, increases resilience, and avoids placing total trust in any single provider or ecosystem.

This document describes:
- which backends can be integrated,
- what they contribute to resilience,
- how TollDNS uses them (client, resolver, miner),
- and how each backend fails over safely.

---

## Why Multiple Backends

A resilient “decentralized Cloudflare” must survive:
- targeted outages on centralized providers,
- policy/regulatory pressure on single organizations,
- single-ASN/cloud correlated failures,
- failures inside any single decentralized protocol.

Therefore TollDNS supports **multiple independent backends** and can automatically re-route when one degrades via watchdog policy.

---

## Backend Categories

### 1) Standard DNS (ICANN / Web2)

**Purpose:** resolve traditional web2 domains.  
**Implementation:** recursive DoH/DoT resolver.

**Early-phase (bootstrapping) strategy:**
- Prefer forwarding recursion to established upstream recursive DNS providers for baseline reliability and to learn “hot” caching targets.
- Move toward **upstream quorum mode** (N-of-M agreement) for correctness cross-checking and safer cache population.
- Progressively increase native recursion share over time while keeping upstream as fallback/cross-check.

**Fallback:** upstream recursors (e.g., Cloudflare/Google/etc.) and cache-only behavior under incident conditions.

---

### 2) Web3 Naming (name → records, content pointers)

**Purpose:** resolve blockchain-based names to addresses, content hashes, and gateway targets.

Examples (integrations via adapters):
- **ENS (Ethereum Name Service):** https://github.com/ensdomains
- **Solana Name Service (.sol) / Bonfida:** https://github.com/Bonfida  
  SNS SDKs: https://github.com/SolanaNameService/sns-sdk
- **Unstoppable Domains Resolution:** https://github.com/unstoppabledomains/resolution

**Where it runs:**
- **Client app** (best UX for browsers/apps)
- **Resolver backend** (server-side lookup)
- **Miner gateways** (content fetch + serving)

**Fallbacks:**
- Centralized RPC providers (temporary)
- Centralized gateway targets for content retrieval (temporary)
- Cached resolution results (TTL-bounded and policy-controlled)

---

### 3) DHT / P2P Name Systems (DNS-like records in a distributed substrate)

**Purpose:** censorship-resistant “records” stored in a large distributed network.

Examples:
- **PKDNS:** https://github.com/pubky/pkdns  
- **PKARR:** https://github.com/pubky/pkarr

**Where it runs:**
- Resolver and/or miner edge nodes
- Client optional (advanced mode)

**Fallbacks:**
- Cache-only for a bounded period (if safe and policy allows)
- “unavailable” response for that namespace if the backend is unhealthy

---

### 4) Alternate Root / TLD Layer

**Purpose:** reduce reliance on the conventional root zone model by supporting alternative naming roots.

Example:
- **Handshake (org):** https://github.com/handshake-org  
  **hnsd resolver:** https://github.com/handshake-org/hnsd

**Where it runs:**
- Resolver layer (and optionally edge/miners)

**Fallback:**
- ICANN DNS (baseline) when alt-root is unhealthy or disabled by policy

---

### 5) Content Addressing + Storage Networks (for gateways)

**Purpose:** fetch and serve content using decentralized storage and addressing.

Examples:
- **IPFS:** https://github.com/ipfs
- **Filecoin:** https://github.com/filecoin-project
- **Arweave:** https://github.com/arweaveteam

**Where it runs:**
- Miner gateways (primary)
- Resolver fallback gateway (secondary)

**Fallbacks:**
- Centralized gateways (temporary)
- Resolver-owned gateway capacity (temporary)
- Cache-only serving for previously retrieved objects (if safe)

---

## Adapter Model (How Integration Works)

Each backend is integrated as an **Adapter** that implements a standard interface so TollDNS can route queries consistently and apply watchdog policies uniformly.

### Adapter Responsibilities
- Accept a standardized resolution request:
  - `name`, `qtype`, `namespace`, optional `client_region_hint`
- Produce a standardized response:
  - DNS RRsets (A/AAAA/CNAME/TXT/HTTPS/SVCB/etc.)
  - or a gateway “resolution result” (content pointer + gateway URL mapping)
- Provide deterministic “conformance hooks” used by watchdog checks
- Declare its fallback mapping (what to use if unhealthy)

### Further Repo Layouts
```txt
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

### Further DISCUSION
```txt
Backend Registry (On-Chain)

Each backend has an on-chain entry (registry record or NFT-like immutable pointer) that references immutable configuration and expected behavior:
	•	backend_id
	•	adapter_id
	•	policy_id (watchdog thresholds + equivalence rules)
	•	verifier_set_id
	•	fallback_backend_set (e.g., Cloudflare/Google or resolver-owned fallback)
	•	conformance_profile_id (what “correct” means for this backend)
	•	content_hash pointers (immutable configs/specs)

This makes integrations composable, auditable, and governance-controlled.

⸻

Developer Gateways (Third-Party Adapters)

TollDNS is intended to support third-party gateways and adapters:
	•	developers can submit new adapters for DAO review
	•	listed adapters can earn ongoing revenue based on routed traffic and proof-of-serving
	•	adapters can be delisted or degraded if they violate policy or fail conformance/health checks

See:
	•	Watchdogs & fallback: docs/03-watchdogs-and-fallback.md
	•	Tokenomics: docs/05-tokenomics.md

