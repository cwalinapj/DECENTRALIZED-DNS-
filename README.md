# DECENTRALIZED-DNS (TollDNS) — A Decentralized “Cloudflare-Like” Resolver + Gateway Network

Repo: https://github.com/cwalinapj/DECENTRALIZED-DNS-

TollDNS is a concept for a **decentralized cloud-edge fabric** starting with **paid recursive DNS (DoH/DoT)** and expanding into a distributed network of **gateway + caching + resilient ingress** operators (“miners”). A small **toll per query** funds infrastructure while making abusive query patterns economically costly.

The long-term goal is a “decentralized Cloudflare”: many independent operators, multi-provider diversity, and automated fallbacks so the network can remain functional even when centralized infrastructure is pressured or attacked.

---

## Why

Centralized edge providers concentrate a large amount of internet reliability and security behind a small number of organizations and networks. That creates systemic risk:
- correlated failure during outages and routing incidents
- policy and regulatory pressure concentrated on single entities
- trust bottlenecks for DNS, gateways, and edge delivery

TollDNS aims to reduce over-reliance on any one provider by funding **distributed, independently operated** edge capacity.

---

## Core Ideas

- **Per-query tolls** paid via **escrow** (no “click OK” prompts)
- **Micropayments via off-chain vouchers**, settled in batches on an **L2**
- **Miners provide edge services** (gateway + cache + ingress) and earn from **proof-of-serving**
- **Regional quotas + diversity controls** to prevent centralization into one cloud/ASN
- **Watchdogs + automatic fallback** to centralized services (Cloudflare/Google/etc.) when a decentralized backend degrades
- **Composable resolution backends** (integrate existing networks instead of reinventing them)

---

## Docs (Prospectus)

Start here:

- Resolution backends (what protocols we integrate and why):  
  `docs/02-resolution-backends.md`

- Watchdogs + automatic fallback (immutable policy + verifiable health):  
  `docs/03-watchdogs-and-fallback.md`

- Functional equivalence proofs (how we decide “backend matches reference behavior”):  
  `docs/04-functional-equivalence-proofs.md`

Recommended supporting docs (add as you build):
- Economics & settlement: `docs/economics-settlement.md`
- Miner eligibility & rewards: `docs/miner-eligibility-rewards.md`
- Routing engine: `docs/routing-algorithm.md`
- Resilience tokenomics (anycast/edges/scrubbing): `docs/resilience-tokenomics.md`
- Flow diagrams (Mermaid): `docs/flow-diagram.md`
- Roadmap: `docs/roadmap.md`

---

## Ecosystem Integrations (Clickable Links)

TollDNS is designed to reuse proven networks and protocols.

### Naming / Resolution
- ENS (Ethereum Name Service): https://github.com/ensdomains
- Solana Name Service / Bonfida (.sol): https://github.com/Bonfida  
  SNS SDK: https://github.com/SolanaNameService/sns-sdk
- Unstoppable Domains Resolution: https://github.com/unstoppabledomains/resolution
- Handshake (alt-root / TLD): https://github.com/handshake-org  
  hnsd resolver: https://github.com/handshake-org/hnsd
- PKDNS (DHT-backed DNS server): https://github.com/pubky/pkdns  
  PKARR (signed packets to DHT): https://github.com/pubky/pkarr

### Content / Storage (Gateways)
- IPFS: https://github.com/ipfs
- Filecoin: https://github.com/filecoin-project
- Arweave: https://github.com/arweaveteam

### Optional Reference Integration
- CoreDNS ENS plugin (reference for bridging DNS <-> ENS): https://github.com/wealdtech/coredns-ens

---

## Status

Early concept / design notes. Expect iteration.

---

## Contributing

If you want to help, areas that matter most:
- voucher + escrow settlement mechanics
- miner scoring and anti-centralization incentives
- watchdog attestation formats + policy state machine
- resolution adapters (ENS/SNS/Handshake/PKDNS/IPFS/Filecoin/Arweave)
- threat modeling and “attack mode” degradation strategies
