# MVP: Watchdogs + Policy (Bootstrap)

This doc contains: **MVP ✅** and references **End-State 🔮**.

## What’s Implemented in MVP

- `ddns_watchdog_policy` on-chain program:
  - allowlisted watchdogs (who observations are attributed to)
  - allowlisted submitters (who can post digests)
  - per-name policy state: OK / WARN / QUARANTINE + penalty and TTL caps
- Attestations are submitted as **digests** (no on-chain signature verification).

## What’s Centralized (Explicit)

- Allowlists:
  - watchdog set is allowlisted in config
  - submitters posting digests are allowlisted in config
- Watchdogs still provide strong auditability because:
  - each watchdog has a stable identity (`watchdog_pubkey`)
  - policy state is deterministic from submitted digests

## How Other Components Use Policy

- Resolvers/gateways read `NamePolicyState`:
  - `WARN`: prefer short TTL, show warning
  - `QUARANTINE`: warn strongly; require explicit override
- Miners/operators can apply `penalty_bps` to rewards off-chain in MVP.

See:
- `PROTOCOL_WATCHDOG_ATTESTATION.md`

