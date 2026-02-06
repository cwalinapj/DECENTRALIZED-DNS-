# Unstoppable Domains Adapter

## What it resolves
- Unstoppable Domains namespaces (e.g., .crypto, .wallet) via supported resolution libraries.

## DNS mapping
- Translates resolution results into DNS RRsets or gateway targets.
- Enforces conformance profile rules for record structure and TTL bounds.

## Watchdog checks
- Chain state verification for name ownership.
- Conformance challenge sets for expected invariants.
- Availability and latency SLOs for resolution endpoints.

## Fallback mapping
- Temporary fallback to centralized RPC providers.
- Cache-only responses when safe.
