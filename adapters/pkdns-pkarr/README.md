# PKDNS / PKARR Adapter

## What it resolves
- PKARR signed DNS packets stored in the Mainline DHT.
- PKDNS-compatible DNS-like records.

## DNS mapping
- Verifies PKARR signatures and converts packets into DNS RRsets.
- Applies conformance rules for TTL bounds and error semantics.

## Watchdog checks
- DHT availability and record retrieval latency.
- Signature validation for PKARR packets.
- Conformance challenge sets for supported qtypes.

## Fallback mapping
- Cache-only responses for bounded windows when DHT is unstable.
- “Unavailable” response if consensus or retrieval fails persistently.
