# PROTOCOL: Watchdog Attestations (v1)

This doc contains: **MVP ✅** (digest submissions, allowlisted watchers) and **End-State 🔮** (permissionless watchers + on-chain signature verification).

## Purpose

Independent watchdogs measure DNS route behavior and emit attestations about:
- availability (timeouts, SERVFAIL, TLS failures)
- integrity (rrset/dest mismatches)
- censorship signals (differential behavior across endpoints/regions)

These attestations feed a **policy state machine** that outputs routing hints:
- `status`: OK | WARN | QUARANTINE
- `confidence_bps`: 0..10000
- `reason_flags`: bitmask of signals
- `recommended_ttl_cap`: optional cap
- `penalty_bps`: penalty signal for rewards/routing (MVP: applied off-chain)

## Hashing Rules

- `name_hash = sha256(UTF8(normalized_name))`
- `normalized_name`:
  - lowercase
  - strip trailing `.`
  - for `.dns` names, include the `.dns` suffix (e.g. `example.dns`)
- `rrset_hash`:
  - `sha256(canonical_dns_answer_bytes)` or the project’s canonical `dest_hash` if using name->dest model
- `resolver_endpoint_hash = sha256(UTF8(endpoint_url_or_ip))`

## Signing (End-State)

Domain separation:

```
msg = SHA256("DDNS_WATCHDOG_ATTEST_V1" || payload_bytes)
sig = ed25519_sign(watchdog_secret, msg)
```

Transport in MVP may be JSON, but **payload_bytes MUST be canonical**.

## Canonical Payload Encoding (Little-Endian)

All ints are little-endian. Arrays are raw bytes.

Common prefix:
- `version: u8` = 1
- `kind: u8`

### 1) ResolveObservationV1 (kind = 1)
Purpose: “I resolved name_hash and observed rrset_hash (or dest_hash).”

Fields:
- version `u8` (1)
- kind `u8` (1)
- name_hash `[u8;32]`
- rrset_hash `[u8;32]`
- ttl_s `u32`
- resolver_endpoint_hash `[u8;32]`
- observed_at_unix `i64`
- observed_slot `u64` (0 if unknown)
- latency_ms `u32`
- outcome `u8`:
  - 0 OK
  - 1 NXDOMAIN
  - 2 SERVFAIL
  - 3 TIMEOUT
  - 4 TLS_FAIL
  - 5 REFUSED
- region_code `u16` (0 if unknown)

### 2) CensorshipSignalV1 (kind = 2)
Purpose: “I saw differential behavior suggestive of blocking.”

Fields:
- version `u8` (1)
- kind `u8` (2)
- name_hash `[u8;32]`
- expected_rrset_hash `[u8;32]`
- observed_rrset_hash `[u8;32]`
- baseline_endpoint_hash `[u8;32]`
- suspect_endpoint_hash `[u8;32]`
- observed_at_unix `i64`
- confidence_bps `u16` (0..10000)
- reason_flags `u32`

### 3) ContentIntegrityV1 (kind = 3)
Purpose: verify that a destination serves expected content.

Fields:
- version `u8` (1)
- kind `u8` (3)
- name_hash `[u8;32]`
- dest_hash `[u8;32]`
- content_hash `[u8;32]`
- observed_at_unix `i64`
- confidence_bps `u16` (0..10000)

## Anti-Replay / Privacy

MVP recommendations:
- attestations have a max age window (e.g. 1 hour)
- watchers bucket `observed_at_unix` into 10-minute windows where practical

## MVP On-Chain Submission (Digest Path)

MVP does **not** verify ed25519 signatures on-chain for attestations.

Instead, an allowlisted submitter posts a digest summary into `ddns_watchdog_policy`:
- includes `epoch_id`, `name_hash`, `kind`, `outcome`, `reason_flags`, `confidence_bps`, and hash fields
- on-chain maintains counters + policy state machine transitions

End-state upgrades can switch to accepting signed payloads + dispute windows.

