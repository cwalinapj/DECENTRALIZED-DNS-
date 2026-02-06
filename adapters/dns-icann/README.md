# DNS ICANN Adapter

## What it resolves
- Standard ICANN domains (A/AAAA/CNAME/TXT/HTTPS/SVCB, etc.).

## DNS mapping
- Directly returns DNS RRsets from recursive resolution.
- Applies canonicalization and validation rules from the active conformance profile.

## Watchdog checks
- Availability and latency SLOs.
- DNSSEC validation rules (when enabled).
- Conformance agreement with upstream quorum for non-DNSSEC cases.

## Fallback mapping
- Upstream recursive providers (Cloudflare/Google/etc.) while bootstrapping.
- Cache-only responses when safe to do so.
