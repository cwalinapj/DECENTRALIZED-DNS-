# Handshake Adapter

## What it resolves
- Handshake TLDs and alt-root namespaces via hnsd/SPV resolution.

## DNS mapping
- Converts Handshake records into standard DNS RRsets.
- Applies conformance rules for canonicalization and error semantics.

## Watchdog checks
- SPV validation and chain consistency.
- Conformance challenge sets for supported qtypes.
- Availability and latency SLOs.

## Fallback mapping
- ICANN DNS for names outside the Handshake root.
- Cache-only responses when Handshake resolution is temporarily unhealthy.
