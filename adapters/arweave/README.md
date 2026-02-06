# Arweave Adapter

## What it resolves
- Content stored on Arweave (permanent storage transactions).

## DNS mapping
- Maps Arweave transaction IDs to gateway targets or DNS records.
- Enforces content addressing and integrity rules from the conformance profile.

## Watchdog checks
- Retrieval success rate and latency.
- Content integrity checks against transaction IDs.
- Conformance challenge sets for gateway mapping behavior.

## Fallback mapping
- Centralized Arweave gateways when decentralized retrieval is degraded.
- Cache-only serving for previously retrieved objects when safe.
