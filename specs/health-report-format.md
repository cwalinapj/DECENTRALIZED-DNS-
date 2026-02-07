# Health Report Format (Spec)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This spec defines the **Health Report** message submitted by verifier/watchdog nodes to the TollDNS policy layer. Health reports drive the immutable circuit-breaker state machine that sets backend states (`HEALTHY`, `DEGRADED`, `DISABLED`, `RECOVERING`) and updates routing policy.

This is a **normative** specification unless stated otherwise.

Related docs:

- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Routing engine: `docs/07-routing-engine.md`

---

## 1. Goals

Health reports must:

- be **small** and cheap to submit
- be **verifiable** (signatures, membership)
- be **privacy-preserving** (no raw user queries)
- support **multi-region** quorum logic
- support both:
  - **availability/performance** measurement, and
  - **conformance** pass/fail signals (bounded equivalence surface)

---

## 2. Terminology

- **Backend**: an integration target (adapter + operator set) identified by `backend_id`.
- **Verifier**: a watchdog node authorized to submit reports for a `verifier_set_id`.
- **Window**: a time bucket during which measurements are aggregated.
- **Region**: a coarse region bucket used for diversity quorum rules.
- **Conformance**: correctness semantics defined by a conformance profile.

---

## 3. Message Envelope

A health report is an object with these top-level fields:

- `report_version` (string, REQUIRED)
- `backend_id` (string, REQUIRED)
- `verifier_set_id` (string, REQUIRED)
- `verifier_id` (string, REQUIRED)
- `region_id` (string, REQUIRED)
- `window_id` (string or integer, REQUIRED)
- `timestamp_ms` (integer, REQUIRED)
- `metrics` (object, REQUIRED)
- `conformance` (object, OPTIONAL)
- `reason_codes` (array, OPTIONAL)
- `signature` (object, REQUIRED)

### 3.1 `window_id` definition

`window_id` MUST correspond to a fixed window duration defined by governance (e.g., 60s, 300s).  
Verifiers MUST report using the canonical window boundaries to enable aggregation.

---

## 4. Metrics Object (REQUIRED)

The `metrics` object MUST include bucketed summaries:

- `probe_count` (integer, REQUIRED)
- `success_count` (integer, REQUIRED)
- `timeout_count` (integer, REQUIRED)
- `error_count` (integer, REQUIRED)

- `success_rate_bucket` (string, REQUIRED)  
  Example buckets: `>=0.99`, `>=0.95`, `>=0.90`, `>=0.75`, `<0.75`

- `latency_p50_bucket_ms` (string, OPTIONAL)
- `latency_p95_bucket_ms` (string, REQUIRED)
- `latency_p99_bucket_ms` (string, OPTIONAL)

Example bucket strings:

- `<25`, `<50`, `<100`, `<200`, `<500`, `<1000`, `>=1000`

- `response_size_p95_bucket_bytes` (string, OPTIONAL)
  Example: `<256`, `<512`, `<1024`, `<2048`, `>=2048`

- `error_class_counts` (object, OPTIONAL)  
  Keys are coarse classes, values are integers:
  - `SERVFAIL`
  - `REFUSED`
  - `NXDOMAIN` (count as outcome class, not necessarily an error)
  - `NODATA`
  - `INVALID_SIG`
  - `MALFORMED`
  - `UPSTREAM_FAIL`
  - `POLICY_BLOCKED`
  - `OTHER`

### 4.1 Counting rules

- `success_count + timeout_count + error_count` MUST be `<= probe_count`
- `NXDOMAIN` and `NODATA` MAY be represented in `error_class_counts` for visibility, but do not necessarily indicate backend failure (policy decides).
- `INVALID_SIG` and `MALFORMED` SHOULD be treated as higher severity signals.

---

## 5. Conformance Object (OPTIONAL)

Conformance checks are defined by `docs/04-functional-equivalence-proofs.md`.

If included, `conformance` MUST include:

- `conformance_profile_id` (string, REQUIRED)
- `challenge_set_id` (string, REQUIRED)
- `result` (enum, REQUIRED):
  - `PASS`
  - `FAIL`
  - `UNKNOWN`
- `fail_count` (integer, OPTIONAL)
- `pass_count` (integer, OPTIONAL)
- `conformance_reason_bucket` (string, OPTIONAL)

Example conformance reason buckets:

- `WRONG_SEMANTICS`
- `INVALID_PROOF`
- `INVALID_SIGNATURE`
- `MALFORMED_RRSET`
- `INTEGRITY_MISMATCH` (CID/hash mismatch)
- `TIMEOUTS_DOMINANT`
- `OTHER`

---

## 6. Reason Codes (OPTIONAL)

`reason_codes` is an optional array of coarse codes intended for auditability:

Examples:

- `PERF_DEGRADED`
- `TIMEOUT_SPIKE`
- `ERROR_SPIKE`
- `INVALID_SIGNATURES`
- `MALFORMED_RESPONSES`
- `CONFORMANCE_FAIL`
- `UPSTREAM_INSTABILITY`

Reason codes MUST NOT include sensitive details or raw query names.

---

## 7. Signature Object (REQUIRED)

The `signature` object MUST include:

- `scheme` (string, REQUIRED)  
  Examples: `ed25519`, `secp256k1`

- `public_key` (string, REQUIRED)  
  Canonical encoding defined by governance.

- `sig` (string, REQUIRED)  
  Signature over a canonical serialization of the report fields.

### 7.1 Canonical serialization

- The serialization format MUST be deterministic (e.g., canonical JSON).
- Field ordering and encoding must be specified and versioned per `report_version`.

---

## 8. Verification Rules (Normative)

A policy contract (or policy enforcement service) MUST verify:

1) `verifier_id` is a member of `verifier_set_id` for the relevant epoch/window.
2) signature is valid for the canonical serialization.
3) `window_id` matches the expected window boundaries.
4) `region_id` is valid and matches verifier configuration (or is acceptable via policy).
5) numeric fields are within bounds (sanity checks).

Reports failing verification MUST be ignored.

---

## 9. Aggregation Semantics (How Policy Uses Reports)

Policy logic is defined elsewhere, but health reports are intended to support:

- multi-verifier quorum across distinct regions
- consecutive-window requirements to avoid flapping
- separate triggers for:
  - performance degradation
  - conformance failure
  - hard failures (invalid signatures, malformed outputs)

---

## 10. Example (Illustrative Only)

```json
{
  "report_version": "1.0",
  "backend_id": "ens-mainnet-adapter-v1",
  "verifier_set_id": "verifiers-epoch-42",
  "verifier_id": "verifier-7",
  "region_id": "NA-WEST",
  "window_id": "2026-02-06T10:05Z/300s",
  "timestamp_ms": 176, 
  "metrics": {
    "probe_count": 120,
    "success_count": 118,
    "timeout_count": 1,
    "error_count": 1,
    "success_rate_bucket": ">=0.95",
    "latency_p95_bucket_ms": "<200",
    "error_class_counts": {
      "SERVFAIL": 1
    }
  },
  "conformance": {
    "conformance_profile_id": "ENS_PROFILE_V1",
    "challenge_set_id": "cid:bafy...abc",
    "result": "PASS",
    "pass_count": 25,
    "fail_count": 0
  },
  "reason_codes": ["PERF_OK"],
  "signature": {
    "scheme": "ed25519",
    "public_key": "base58:...",
    "sig": "base58:..."
  }
}
