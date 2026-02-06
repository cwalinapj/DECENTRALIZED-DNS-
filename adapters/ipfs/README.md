# IPFS Adapter

## What it resolves
- Content addressed by IPFS CIDs.

## DNS mapping
- Maps content hashes to gateway targets or synthetic DNS records.
- Verifies CID integrity where possible.

## Watchdog checks
- Availability and retrieval latency from gateway infrastructure.
- CID integrity checks for sampled content.
- Conformance challenge sets for supported resolution rules.

## Fallback mapping
- Centralized IPFS gateways when decentralized retrieval is degraded.
- Cache-only serving for previously retrieved objects when safe.
