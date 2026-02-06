# Solana Name Service (Bonfida/SNS) Adapter

## What it resolves
- Solana Name Service (.sol) records via Bonfida/SNS APIs.

## DNS mapping
- Maps SNS records to DNS RRsets or gateway targets.
- Applies canonicalization rules and validation checks from the conformance profile.

## Watchdog checks
- Chain state consistency for record lookups.
- Signature/ownership verification.
- Conformance challenge sets for expected invariants.

## Fallback mapping
- Temporary fallback to centralized RPC providers.
- Cache-only responses within TTL bounds when safe.
