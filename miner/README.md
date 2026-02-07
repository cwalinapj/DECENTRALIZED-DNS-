# Miner / Operator (Edge, Gateway, Cache, Anycast, Scrubbing)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

# Miner / Operator (Edge, Gateway, Cache, Anycast, Scrubbing)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

Miners (operators) provide distributed infrastructure:

- EDGE-INGRESS (admission + caching)
- GATEWAY (web3/content retrieval)
- CACHE (RRsets/routes/content)
- optional ANYCAST ingress
- optional SCRUBBING capacity

Economic rule:

- Miners must **stake native token** (time-locked, exit delay).
- Miners are paid in **native token** based on proof-of-serving and performance.

Related:

- Tokenomics: `docs/05-tokenomics.md`
- Resilience tokenomics: `docs/06-resilience-tokenomics.md`
- Receipt format: `specs/receipt-format.md`

---

## Phase 1 (Beta): Miner Docker Stack (First Release)

The first miner release will be a **Docker-based stack** so operators can participate immediately using:

- VPS / dedicated servers
- home labs / NUCs
- existing Linux hosts

Why Docker first:

- fastest onboarding for early operators
- rapid iteration and upgrades during beta
- easier debugging, logging, rollback, and reproducibility
- avoids “frozen firmware” too early

The Docker miner stack is expected to include (role-dependent):

- ingress proxy (DoH/DoT admission + forwarding)
- caching service (RRsets / validated routes)
- gateway services (optional: IPFS/Filecoin/Arweave retrieval)
- operator agent (registration, key management, receipts)
- metrics exporter (bucketed, privacy-preserving)

---

## Phase 2: Reference Miner Firmware (Raspberry Pi 5 + NVMe)

After the Docker beta stabilizes, TollDNS will provide a **reference miner firmware image** designed for:

- Raspberry Pi 5 (8GB)
- NVMe HAT (M.2) + active cooling
- 512GB NVMe (starter kit default)
- “plug-and-play” boot experience (flash → boot → register → serve)

(Kit option: Pi 5 + case + NVMe HAT + fan/heatsink + 512GB NVMe, pre-flashed or guided flash.)

---

## Phase 3: Router Firmware (Open-Source Router Platforms)

Next, firmware/packages for **routers that already run open-source routing software** (OpenWrt-class devices):

- DoH/DoT edge ingress
- local DNS caching
- routing policy enforcement
- receipt signing where applicable

Routers may be constrained, so default roles may focus on ingress + cache.

---

## Phase 4: Purpose-Built “ASIC Router/Home AP” Miner Appliances

Eventually, support purpose-built edge/router appliances optimized for:

- high-throughput ingress and handshake handling
- fast policy enforcement and routing
- large cache performance (NVMe/SSD)
- sustained operation under Attack Mode conditions
- power efficiency and predictable performance

Even with specialized hardware, the network remains open to:

- Docker miners,
- Pi miners,
- router firmware miners,
- and standard server operators,
with diversity rules preventing domination by any single class.

### Goals

- reduce friction for participation (no extra box required)
- enable “always-on” neighborhood edge coverage
- push caching and admission gating closer to end users

### Expected Capabilities (Policy-Dependent)

- **DoH/DoT edge ingress** (toll booth admission + forwarding)
- **local DNS caching** (hot RRsets and validated routes)
- **routing policy enforcement** (respect backend health states, quotas, and fallback rules)
- receipt signing (where the router is acting as an operator role)

### Notes

Router builds may be more constrained than Pi builds (CPU/RAM/storage), so roles may be limited to ingress + cache by default, with gateway/content retrieval reserved for higher-capacity nodes.

Miners (operators) provide distributed infrastructure:

- EDGE-INGRESS (admission + caching)
- GATEWAY (web3/content retrieval)
- CACHE (RRsets/routes/content)
- optional ANYCAST ingress
- optional SCRUBBING capacity

Economic rule:

- Miners must **stake native token** (time-locked, exit delay).
- Miners are paid in **native token** based on proof-of-serving and performance.

Operator responsibilities:

- serve requests under routing policy
- produce signed receipts (batch receipts preferred)
- maintain uptime/performance SLOs
- respect policy enforcement (delisting, disabled backends, compliance rules)

  ---

## Longer-Term: Purpose-Built “ASIC Router” Miner Appliances

Eventually, TollDNS can support miners that are **purpose-built edge/router appliances** (often described as “ASIC routers”) built specifically for:

- high-throughput edge ingress (DoH/DoT),
- fast policy enforcement and routing decisions,
- large cache performance (NVMe/SSD),
- sustained operation under attack-mode conditions,
- and efficient packet processing per watt.

### Why Specialized Hardware

- consistent performance under heavy load
- better cost/performance for large deployments
- improved survivability during large-scale incidents
- easier “drop-in” deployments at POPs and last-mile locations

### Compatibility

Even if purpose-built hardware exists, the network remains open to:

- Pi-based miners,
- open-source router firmware miners,
- and standard server/VPS operators,

with routing quotas and diversity rules ensuring no single class dominates.

Related:

- Tokenomics: `docs/05-tokenomics.md`
- Resilience tokenomics: `docs/06-resilience-tokenomics.md`
- Receipt format: `specs/receipt-format.md`
