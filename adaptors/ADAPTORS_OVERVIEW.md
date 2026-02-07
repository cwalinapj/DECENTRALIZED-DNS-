# Adaptors Overview

This document groups adapters by function and summarizes pros/cons and pricing signals.

## Naming Systems

### ENS (.eth)
Pros:
- Widely adopted wallet-compatible naming on Ethereum.
- Strong ecosystem tooling and resolvers.
Cons:
- Mainnet gas costs for updates.
- Short names are expensive.
Pricing:
- Annual fee varies by length (5+ cheaper, 3-4 much higher) + gas.

### Solana SNS (Bonfida)
Pros:
- Fast, low-fee Solana name system.
- Good UX for Solana-native users.
Cons:
- Smaller ecosystem vs ENS.
Pricing:
- Protocol fees vary; check current registrar pricing.

### Unstoppable Domains
Pros:
- One-time purchase model for many TLDs.
- Multi-chain support.
Cons:
- Pricing varies widely by tier and TLD.
Pricing:
- Tiered USD pricing by length and TLD; premium names higher.

### Handshake
Pros:
- Decentralized root zone model.
- Permissionless auctions.
Cons:
- Requires custom resolvers or gateways.
Pricing:
- Auction-based; renewal fees depend on protocol/registrar.

### PKDNS / PKARR
Pros:
- Lightweight PKI-backed name resolution.
- Good for secure device identity.
Cons:
- Smaller ecosystem and tooling.
Pricing:
- Protocol-level; infra costs only.

## Storage Networks

### IPFS
Pros:
- Content-addressed storage and broad tooling.
- Good for static page hosting.
Cons:
- Availability depends on pinning.
Pricing:
- Depends on pinning provider or in-house infra.

### Filecoin
Pros:
- Durable storage with economic guarantees.
- CDN options via Filecoin Onchain Cloud.
Cons:
- Deal/egress complexity.
Pricing:
- Storage + egress per TiB; see provider rates.

### Arweave
Pros:
- Permanent storage model.
- One-time fee for long-term storage.
Cons:
- Upfront cost; fee varies with AR price.
Pricing:
- Dynamic fee per size; use fee calculator.

## DNS + Routing

### DNS (ICANN)
Pros:
- Universal browser compatibility.
- Works with legacy resolvers.
Cons:
- Centralized registrars.
Pricing:
- Registrar-dependent.

### DNS Upstream Quorum
Pros:
- Redundant upstream resolution.
- Better uptime and reliability.
Cons:
- Higher upstream cost/complexity.
Pricing:
- Infra dependent.

### Tor ODoH
Pros:
- Privacy-preserving DNS with ODoH.
- Resistant to local network surveillance.
Cons:
- Latency overhead.
Pricing:
- Infra dependent.

## Gateways

### Web3 Name Gateway
Pros:
- Single gateway for many naming systems.
- Simplifies resolution UX.
Cons:
- Central point for routing policy.
Pricing:
- Infra dependent; tied to usage volume.
