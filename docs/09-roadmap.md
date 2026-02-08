# 09 — Roadmap (Milestones, Phases, Deliverables)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This roadmap is written as a prospectus-style plan: start with a viable paid recursive DNS, then progressively add decentralization, gateways, watchdog safety, and finally “decentralized Cloudflare-like” capabilities (edge, anycast, scrubbing, and potentially DePIN ISP/fiber).

The roadmap is intentionally modular so the project can ship useful capability early and grow into higher ambition without blocking on unsolved pieces.

---

## Partnership & Ecosystem Strategy (We’re Looking for Partners)

TollDNS is actively seeking partners across infrastructure, security, Web3 naming/storage, and hardware.

Our view is that a decentralized, policy-driven DNS + gateway + edge network can **outcompete centralized edge providers** over time by offering:

- **Web3-native resolution and login primitives** (identity + naming + content addressing),
- **more composable services** than a single provider can ship alone (via adapters and third-party gateways),
- **consumer-facing features** that users have not seen yet (privacy, portable identity, decentralized routing choices, incentive-aligned infrastructure),
- and **resilience through multi-operator diversity** rather than reliance on a single organization.

If you operate:

- edge infrastructure / POP capacity,
- DDoS scrubbing / security tooling,
- Web3 naming/storage protocols,
- hardware manufacturing / router platforms,
- or developer platforms that want first-class integration,
we want to talk.

---

## Guiding Principles

- **Ship a wedge early:** paid DoH/DoT recursion + stable Index Unit tolls.
- **Keep chain out of the hot path:** vouchers + batch settlement.
- **Composable integrations:** reuse existing networks (ENS/SNS/Handshake/PKDNS/IPFS/Filecoin/Arweave, etc.).
- **Safety first:** watchdogs + automatic fallback is mandatory before heavy decentralization claims.
- **Diversity over vanity decentralization:** multi-ASN/region quotas and reward caps from day one.

---

## Phase 0 — Repo, Specs, and Prototype Skeleton (0 → 1)

**Goal:** lock in design constraints and produce a runnable prototype skeleton.

**Deliverables**

- Docs/specs stabilized:
  - Vision: `docs/00-vision.md`
  - Architecture: `docs/01-architecture-overview.md`
  - Backends: `docs/02-resolution-backends.md`
  - Watchdogs: `docs/03-watchdogs-and-fallback.md`
  - Equivalence: `docs/04-functional-equivalence-proofs.md`
  - Tokenomics: `docs/05-tokenomics.md`
  - Resilience: `docs/06-resilience-tokenomics.md`
  - Routing: `docs/07-routing-engine.md`
  - Threat model: `docs/08-threat-model.md`
  - Roadmap: `docs/09-roadmap.md`
- Specs defined:
  - backend interface: `specs/backend-interface.md`
  - health reports: `specs/health-report-format.md`
  - receipts: `specs/receipt-format.md`
  - policy state machine: `specs/policy-state-machine.md`
- Minimal runnable prototype plan:
  - DoH/DoT gateway scaffold
  - voucher verification scaffold
  - policy read + routing stub

**Exit criteria**

- clear MVP scope and interfaces
- test harness defined for routing + health states

---

## Phase 1 — MVP: Paid Recursive DNS with Index Unit Tolls (1 → 2)

**Goal:** a working paid gateway that users can point devices at.

**Deliverables**

- DoH/DoT recursive gateway with:
  - query handling
  - caching
  - basic abuse limits
- Client stub (desktop first):
  - system DNS interception
  - voucher signing
  - spend rules (limits, emergency stop)
- Index Unit spend escrow logic (minimal):
  - deposit/withdraw
  - per-query toll decrement via vouchers (off-chain)
- Batch settlement MVP:
  - gateway aggregates vouchers
  - periodic settlement transaction to L2 mock or test chain
- Bootstrapping recursion mode:
  - upstream-forwarded resolution for reliability initially (optionally quorum-based)

**Exit criteria**

- end-user can resolve normal domains through TollDNS reliably
- toll collection works without per-query prompts

---

## Phase 2 — Watchdogs + Automatic Fallback (2 → 3)

**Goal:** prove “it stays up safely” before claiming decentralization.

**Deliverables**

- Verifier node network MVP:
  - multi-region probing
  - signed health reports
- On-chain policy contract MVP:
  - backend states: HEALTHY/DEGRADED/DISABLED/RECOVERING
  - routing policy record updates
- Automatic fallback:
  - degrade or disable unhealthy backends
  - fallback to centralized upstreams when required
- Bounded conformance challenge sets:
  - pass/fail attestations for key resolution surfaces

**Exit criteria**

- observable, auditable automatic switching under simulated outages
- no manual “flip a switch” requirement in normal incident modes

---

## Phase 3 — Miner Network (Beta): Docker Stack + Initial Gateways (3 → 4)

**Goal:** start distributing workload to independent operators using the fastest-to-ship onboarding path.

**Deliverables**

- **Miner Docker stack (first miner release)**:
  - edge ingress + admission gating (“toll booth”)
  - caching (RRsets + validated routes)
  - optional gateway components (content retrieval)
  - operator agent (registration, keys, receipt signing)
  - telemetry exporter (bucketed, privacy-preserving)
- Proof-of-serving receipts:
  - signed receipts (batch receipts preferred)
- Native token reward system (minimal):
  - payout based on delivered service
  - baseline performance weighting
- Developer adapter tooling:
  - adapter interface + test harness
  - developer documentation
- Initial gateway integrations (choose subset):
  - ENS: <https://github.com/ensdomains>
  - SNS/Bonfida: <https://github.com/Bonfida> and <https://github.com/SolanaNameService/sns-sdk>
  - Handshake: <https://github.com/handshake-org> and <https://github.com/handshake-org/hnsd>
  - PKDNS/PKARR: <https://github.com/pubky/pkdns> and <https://github.com/pubky/pkarr>
  - IPFS/Filecoin/Arweave: <https://github.com/ipfs> / <https://github.com/filecoin-project> / <https://github.com/arweaveteam>

**Exit criteria**

- operators can join via Docker, be routed traffic, and be paid for it
- at least one web3 namespace + one content network works end-to-end

---

## Phase 4 — Reference Miner Firmware (Raspberry Pi + NVMe) (4 → 5)

**Goal:** move from beta Docker miners to consumer-friendly “plug-and-play” miners.

**Deliverables**

- Reference miner firmware image targeting:
  - Raspberry Pi 5 (8GB)
  - NVMe HAT + active cooling
  - 512GB NVMe starter config
- Optional kit path:
  - Pi + case + NVMe HAT + fan/heatsink + NVMe
- Onboarding UX:
  - flash → boot → register → serve
- Role constraints:
  - ingress + cache baseline
  - gateway features as performance allows

**Exit criteria**

- non-expert operators can reliably deploy and stay online
- measurable geographic/ASN diversity improvement vs VPS-only

---

## Phase 5 — Diversity Enforcement + Anti-Centralization (5 → 6)

**Goal:** prevent “cheap VPS proxy mining” from turning into de-facto centralization.

**Deliverables**

- Routing-time diversity constraints:
  - ASN caps
  - operator caps
  - optional subnet caps
- Settlement-time reward caps:
  - cap by operator and ASN per epoch
- Region quotas:
  - target capacities per region for edge/gateway/cache
  - scarcity multipliers active
- Governance stake pool (time-locked):
  - required for miners/operators and business/dev roles
  - lock + exit delay rules enforced

**Exit criteria**

- measurable reduction in concentration even under incentive pressure
- new operators can’t dominate by spinning up fleets in one provider

---

## Phase 6 — Resilience Upgrades: Anycast + Scrubbing + Attack Mode (6 → 7)

**Goal:** evolve into “lifeboat-grade” resilience.

**Deliverables**

- Anycast ingress role (optional advanced):
  - eligibility checks
  - reachability verification
  - anycast reward multipliers
- Scrubbing role (optional advanced):
  - capacity commitments
  - verification mechanisms
  - attack-mode bonuses
- Attack Mode:
  - automatic trigger conditions
  - cache-first / cache-only policies for certain patterns
  - tighter admission gating
- Operational runbooks + dashboards (even if basic)

**Exit criteria**

- proven ability to sustain service under stress tests and partial outages
- automatic incident-mode transitions are auditable and recover automatically

---

## Phase 7 — Router Firmware (Open-Source Router Platforms) (7 → 8)

**Goal:** enable “always-on” neighborhood edge participation without extra hardware.

**Deliverables**

- firmware/packages for routers that already run open-source routing software (OpenWrt-class)
- ingress + caching roles by default
- policy enforcement and receipt signing (where applicable)
- constrained-hardware role profiles (avoid overpromising)

**Exit criteria**

- meaningful participation from home/small-office networks
- improved distribution and survivability during incidents

---

## Phase 8 — Nameserver Mode + “Cloudflare-Like” Features (8 → 9)

**Goal:** expand from recursive gateway into more edge features while keeping Index Unit usage pricing.

**Deliverables**

- Nameserver usage features (authoritative-like services where applicable)
- Additional edge capabilities:
  - web3 route caching at NS level
  - accelerated resolution paths
  - policy-based routing controls
- Pricing model:
  - usage always priced in Index Units
  - role-based staking continues for business/dev/operator tiers

**Exit criteria**

- real value beyond recursion: performance/security features comparable to edge providers
- extensible developer ecosystem of gateways/adapters

---

## Phase 9 — Purpose-Built “ASIC Router” Miner Appliances (9+)

**Goal:** support miners as purpose-built edge/router devices optimized for TollDNS workloads.

**Deliverables**

- hardware partner program and reference design targets
- secure provisioning flow (keys, firmware attestation, updates)
- high-throughput ingress + routing + caching profiles
- attack-mode survivability targets

**Exit criteria**

- predictable edge performance at scale
- broad distribution without sacrificing diversity constraints

---

## Phase 10 — Optional Expansion: DePIN ISP / Fiber Network (10+)

**Goal:** if pursued, build physical last-mile resilience.

**Deliverables (conceptual)**

- financing model using native token (grants, subsidies, ROI governance)
- deployment incentives and operator onboarding
- legal/compliance and locality constraints per region
- integration with TollDNS routing and resilience layer

**Exit criteria**

- clear feasibility and sustainable incentives
- no compromise of core DNS/gateway reliability

---

## Cross-Cutting Work (Ongoing)

These run across all phases:

- security audits and bug bounties (native token)
- privacy hardening
- improved conformance proofs (Tier 1 → Tier 2/3 over time)
- governance process improvements and safety rails
- documentation and developer tooling
- partnership development (protocols, POPs, scrubbing, hardware, developer ecosystems)

---

## Measuring Success (Suggested Metrics)

- global success rate and tail latency (p95/p99)
- fallback frequency and mean time to recovery
- operator diversity: ASNs, providers, regions
- cache hit ratio and upstream dependency reduction
- attack mode performance under stress tests
- gateway adoption and developer ecosystem growth
- number of partners and integrated services/adapters

---
