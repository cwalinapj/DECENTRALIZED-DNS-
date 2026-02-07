# Miner / Operator (Edge, Gateway, Cache, Anycast, Scrubbing)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

## Reference Miner Hardware (Phase 1) + Router Firmware (Phase 2)

To bootstrap a real, distributed operator base, TollDNS will ship a **reference “miner firmware”** targeting affordable, widely available hardware:

**Phase 1 (Reference Miner Hardware)**
- **Raspberry Pi 5 (8GB)**
- **NVMe HAT** + active cooling
- **512GB NVMe** (starter size; scalable)
- “**plug-and-play**” operator experience (flash, boot, register, serve)

We plan to:
- publish the miner firmware and build instructions (open distribution),
- and optionally offer a **ready-to-run kit** (Pi 5 + case + NVMe HAT + fan + 512GB NVMe) so non-experts can deploy reliable edge/cache/gateway capacity quickly.

- ## Next Phase: Router Firmware (Open-Source Router Platforms)

After the Raspberry Pi reference miner, the next phase is to support **routers that already run open-source routing software** (e.g., OpenWrt-class platforms).

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
