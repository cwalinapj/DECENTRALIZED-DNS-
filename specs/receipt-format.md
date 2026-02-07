# Receipt Format (Proof-of-Serving) -- Spec

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This spec defines the **Proof-of-Serving Receipt** produced by
miners/operators (edges, gateways, caches, resolvers where applicable).
Receipts are used for:

- **reward accounting** (native token payouts),
- **auditability** (who served what class of work under which policy),
- and **fraud resistance** (preventing fake "served traffic" claims).

Receipts are designed to be:

- small,
- verifiable,
- privacy-preserving (no raw domain names by default),
- and compatible with batch settlement.

Normative unless stated otherwise.

Related docs:

- Tokenomics: `docs/05-tokenomics.md`
- Routing engine: `docs/07-routing-engine.md`
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`

---

## 1. Goals

Receipts MUST:

- prove that an operator performed a unit of work (or a batch of work)
- bind that work to a **policy version** and **backend/operator identity**
- be verifiable by resolvers/settlement agents and (optionally) on-chain
- avoid leaking sensitive user query data
- support aggregation/batching to reduce overhead

---

## 2. Terminology

- **Operator**: miner providing EDGE-INGRESS, GATEWAY, CACHE, ANYCAST,
  SCRUBBING, etc.
- **Resolver**: entity coordinating query handling and settlement.
- **Receipt**: signed statement from operator about service provided.
- **Request Hash**: hash of normalized request fields (no raw name
  unless policy allows).
- **Response Hash**: hash of normalized response summary.

---

## 3. Receipt Types

Receipts may exist in two forms:

### 3.1 Per-Request Receipt

One receipt per request (simple, heavier overhead).

### 3.2 Batch Receipt (RECOMMENDED)

One receipt summarizing many requests within a time window:

- reduces signature costs
- reduces settlement overhead
- still enables auditing via Merkle proofs (optional)

This spec supports both.

---

## 4. Canonical Receipt Envelope

A receipt MUST include:

- `receipt_version` (string, REQUIRED)
- `receipt_type` (enum, REQUIRED): `PER_REQUEST` | `BATCH`
- `operator_id` (string, REQUIRED)
- `operator_role` (enum, REQUIRED): `EDGE_INGRESS` | `GATEWAY` | `CACHE` |
  `CORE_RESOLVER` | `ANYCAST` | `SCRUBBING`
- `backend_id` (string, REQUIRED)
  (The backend/adaptor context being served; for pure edge ingress
  this may be `edge-ingress`.)
- `policy_version` (string/int, REQUIRED)
- `window_id` (string/int, REQUIRED)
- `timestamp_ms` (int, REQUIRED)
- `service_summary` (object, REQUIRED)
- `integrity` (object, OPTIONAL but RECOMMENDED)
- `signature` (object, REQUIRED)

---

## 5. Service Summary (REQUIRED)

### 5.1 Common Fields

- `request_count` (int, REQUIRED)
- `success_count` (int, REQUIRED)
- `error_count` (int, REQUIRED)
- `served_from_cache_count` (int, OPTIONAL)
- `bytes_served_total` (int, REQUIRED)
- `latency_p95_bucket_ms` (string, OPTIONAL)
- `response_size_p95_bucket_bytes` (string, OPTIONAL)
- `error_class_counts` (object, OPTIONAL)

Error classes SHOULD match health-report classes where possible.

### 5.2 Optional: Work Class Buckets

Operators MAY include high-level buckets to support pricing differentiation:

- `work_class_counts`:
  - `DNS_RECURSION_LIGHT`
  - `DNS_RECURSION_HEAVY`
  - `GATEWAY_LOOKUP`
  - `CONTENT_RETRIEVAL_SMALL`
  - `CONTENT_RETRIEVAL_LARGE`
  - `CACHE_HIT`
  - `CACHE_MISS`
  - `OTHER`

Buckets MUST NOT include raw names/domains by default.

---

## 6. Integrity Object (OPTIONAL but RECOMMENDED)

The integrity object binds receipts to the underlying requests without
revealing them.

### 6.1 For PER_REQUEST

- `request_hash` (string, REQUIRED)
- `response_hash` (string, OPTIONAL)
- `request_hash_scheme` (string, REQUIRED)
- `response_hash_scheme` (string, OPTIONAL)

### 6.2 For BATCH

Batch receipts SHOULD include one of:

**Option A (simple):**

- `batch_hash` (hash over ordered list of request hashes, or over a canonical aggregate)

**Option B (auditable, recommended):**

- `merkle_root` (Merkle root of per-request leaf hashes)
- `leaf_hash_scheme`
- `merkle_scheme`

In Option B, the resolver/settlement agent can request Merkle proofs for
audit samples.

---

## 7. Hashing & Privacy (Normative)

### 7.1 Request Hash (Recommended Normalized Fields)

The request hash SHOULD be computed over normalized fields such as:

- `namespace`
- `qtype`
- `policy_version`
- `window_id`
- `routing_target_id` (backend/operator)
- optional: truncated name hash (HMAC or salted hash), not raw name

### 7.2 Name Handling

By default:

- raw domain names MUST NOT be included.
- if name binding is required for fraud prevention, use:
  - `name_hash = HMAC(k_epoch, canonical_name)`  
    where `k_epoch` rotates and is not publicly revealed.

This allows verification/audits without exposing user browsing patterns publicly.

### 7.3 Response Hash

Response hash SHOULD cover:

- status code
- RRset summary (types/counts, not full raw records unless needed)
- size bucket
- TTL bucket

---

## 8. Signature (REQUIRED)

Receipts MUST include:

- `scheme` (string, REQUIRED) e.g., `ed25519`, `secp256k1`
- `public_key` (string, REQUIRED)
- `sig` (string, REQUIRED)

Signature MUST be over a deterministic canonical serialization of receipt fields.

---

## 9. Verification Rules (Normative)

A verifier/settlement agent MUST verify:

1) operator is registered and active (and has required stake status for the epoch)
2) signature valid over canonical serialization
3) `policy_version` is current/valid for that window
4) counts are within sane bounds (e.g., `success_count + error_count <= request_count`)
5) if using Merkle roots: Merkle proofs validate for sampled leaves

Receipts failing verification MUST be rejected for payout.

---

## 10. Anti-Fraud Mechanisms (Recommended)

- random audit sampling of batch receipts (request Merkle proofs)
- cross-check with resolver-side observed traffic counts
- enforce per-operator caps and anomaly detection (sudden spikes)
- require conformance for correctness-sensitive buckets
- penalize operators with repeated unverifiable receipts (policy-defined)

---

## 11. Example (Illustrative Only)

### 11.1 Batch Receipt (simplified)

```json
{
  "receipt_version": "1.0",
  "receipt_type": "BATCH",
  "operator_id": "op-123",
  "operator_role": "GATEWAY",
  "backend_id": "ipfs-gateway-v1",
  "policy_version": "pv-2026-02-06-01",
  "window_id": "2026-02-06T10:05Z/300s",
  "timestamp_ms": 1760000000,
  "service_summary": {
    "request_count": 5000,
    "success_count": 4950,
    "error_count": 50,
    "bytes_served_total": 120000000,
    "work_class_counts": {
      "GATEWAY_LOOKUP": 3000,
      "CONTENT_RETRIEVAL_SMALL": 1900,
      "CONTENT_RETRIEVAL_LARGE": 100
    }
  },
  "integrity": {
    "merkle_root": "hex:abc123...",
    "leaf_hash_scheme": "HMAC-SHA256(epoch_key)",
    "merkle_scheme": "MERKLE-SHA256"
  },
  "signature": {
    "scheme": "ed25519",
    "public_key": "base58:...",
    "sig": "base58:..."
  }
}
