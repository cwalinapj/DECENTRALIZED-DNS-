# Filecoin Adapter

## What it resolves
- Content retrieval from Filecoin storage and retrieval markets.

## DNS mapping
- Maps content identifiers to gateway targets or DNS records.
- Validates content addressing rules defined in the conformance profile.

## Watchdog checks
- Retrieval success rate and latency.
- Content integrity checks against declared CIDs.
- Conformance challenge sets for gateway mapping behavior.

## Fallback mapping
- Centralized gateways or resolver-owned retrieval capacity.
- Cache-only serving for previously retrieved objects when safe.
