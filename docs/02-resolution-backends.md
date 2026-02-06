# Resolution Backends (Composable DNS + Web3 + Storage Networks)

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
- regulatory pressure on single organizations,
- single-ASN/cloud correlated failures,
- failures inside any single decentralized protocol.

Therefore TollDNS supports **multiple independent backends** and can automatically re-route when one degrades.

---

## Backend Categories

### 1) Standard DNS (ICANN)
**Purpose:** resolve traditional web2 domains.  
**Implementation:** recursive DoH/DoT resolver.

**Early-phase strategy (bootstrapping):**
- Prefer forwarding recursion to established upstream recursors for reliability and to learn “hot” caching targets.
- Move toward upstream quorum checks and eventually more native recursion.

**Fallback:** always available (this is the baseline “works everywhere” mode).

---

### 2) Web3 Naming (name → records, content pointers)
**Purpose:** resolve blockchain-based names to addresses, content hashes, and gateway targets.

Examples (integrations via adapters):
- **Ethereum Name Service (ENS)** — GitHub org: https://github.com/ensdomains
- **Solana Name Service (.sol)** (Bonfida/SNS) — org: https://github.com/Bonfida  
  SDKs: https://github.com/SolanaNameService/sns-sdk
- **Unstoppable Domains** — Resolution library: https://github.com/unstoppabledomains/resolution

**Where it runs:**
- Client app (best UX for browsers/apps)
- Resolver backend (server-side lookup)
- Miner gateways (content fetch + serving)

**Fallbacks:**
- Centralized RPC providers (temporary)
- Centralized gateway targets for content retrieval (temporary)
- Cached resolution results (safe TTL-bounded)

---

### 3) DHT / P2P Name Systems (DNS-like records in a distributed substrate)
**Purpose:** censorship-resistant “records” stored in a large distributed network.

Examples:
- **PKDNS** — DNS server resolving PKARR records from the Mainline DHT: https://github.com/pubky/pkdns
- **PKARR** — signed DNS packets published to the DHT: https://github.com/pubky/pkarr

**Where it runs:**
- Resolver and/or miner edge nodes
- Client optional (advanced mode)

**Fallbacks:**
- Cache-only for a bounded period (if safe)
- “unavailable” response for that namespace if the backend is unhealthy

---

### 4) Alternate Root / TLD Layer
**Purpose:** reduce reliance on the conventional root zone model by supporting alternative naming roots.

Example:
- **Handshake** (SPV resolver + fallback to ICANN root inside hnsd design):  
  hnsd: https://github.com/handshake-org/hnsd  
  org: https://github.com/handshake-org

**Where it runs:**
- Resolver layer (and optionally edge/miners)

**Fallback:**
- ICANN DNS (baseline) when alt-root is unhealthy or disabled by policy

---

### 5) Content Addressing + Storage Networks (for gateways)
**Purpose:** fetch and serve content using decentralized storage and addressing.

Examples:
- **IPFS** — https://github.com/ipfs
- **Filecoin** — https://github.com/filecoin-project
- **Arweave** — https://github.com/arweaveteam

**Where it runs:**
- Miner gateways (primary)
- Resolver fallback gateway (secondary)

**Fallbacks:**
- Centralized gateways (temporary)
- Resolver-owned gateway capacity (temporary)
- Cache-only serving for previously retrieved objects (if safe)

---

## Adapter Model (How Integration Works)

Each backend is integrated as an **Adapter** that implements the same interface.

### Adapter Responsibilities
- Accept a standardized resolution request:
  - `name`, `qtype`, `namespace`, and optional `client_region_hint`
- Produce a standardized response:
  - DNS RRsets (A/AAAA/CNAME/TXT/HTTPS/SVCB/etc.)
  - or a gateway “resolution result” (content pointer + gateway URL mapping)
- Provide deterministic “conformance hooks” used by watchdog checks
- Declare its fallback mapping (what to use if unhealthy)

### Suggested Repo Layout
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
```
