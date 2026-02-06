# ENS Adapter

## What it resolves
- Ethereum Name Service (.eth) records and content hashes.

## DNS mapping
- Maps ENS records to DNS RRsets (A/AAAA/TXT/HTTPS/SVCB) or gateway targets.
- Applies canonicalization rules from the ENS conformance profile.

## Watchdog checks
- Chain state consistency for record lookups.
- Signature/ownership validation rules.
- Conformance challenge sets against reference resolution logic.

## Fallback mapping
- Temporary fallback to centralized RPC providers.
- Cache-only answers within TTL bounds when safe.
