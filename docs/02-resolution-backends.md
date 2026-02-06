# Resolution Backends & On-Chain Registry

This document describes how TollDNS models resolution backends and how their configuration is recorded on-chain for auditability.

## Backend Registry (On-Chain)

Each backend has an on-chain entry (registry record or NFT-like object) that points to immutable configuration and expected behavior:

- backend_id
- adapter_id
- policy_id (watchdog thresholds + equivalence rules)
- verifier_set_id
- fallback_backend_set (e.g., Cloudflare/Google or a resolver-owned fallback)
- conformance_profile_id (what “correct” means for this backend)
- content_hash pointers (immutable configs/specs)

This makes the integration composable and auditable. Resolvers can retrieve the registry entry, verify its content hashes, and route according to the immutable policy.

## Default Backend Sets (Suggested)

### Standard Web2
- Primary: TollDNS recursion (or upstream forwarding early)
- Fallback: upstream set (Cloudflare, Google, etc.) and/or quorum mode

### Web3 Names
- Primary: chain-specific adapter (ENS/SNS/Unstoppable)
- Fallback: centralized RPC + cached results (policy-controlled)

### Content Retrieval
- Primary: decentralized retrieval (IPFS/Filecoin/Arweave)
- Fallback: centralized gateways + cache-only mode

## What “Resilience” Means Here

Resilience is achieved by:
- having multiple independent backends,
- measuring them continuously (watchdogs),
- enforcing automatic fallback based on immutable policy,
- and keeping safe caches to provide continuity under incident conditions.

See `docs/03-watchdogs-and-fallback.md` and `docs/04-functional-equivalence-proofs.md`.
