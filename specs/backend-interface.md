# Backend Adapter Interface (Spec)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

This spec defines the **standard interface** implemented by all TollDNS backends/adapters (DNS recursion, Web3 name systems, DHT systems, gateways, storage networks). A uniform interface allows the routing engine and watchdogs to treat integrations consistently.

This is a **normative** specification unless stated otherwise.

---

## 1. Terms

- **Backend**: a named integration target (e.g., ENS resolver, IPFS gateway retrieval, Handshake resolver).
- **Adapter**: code module that implements this interface for a backend.
- **Resolver**: TollDNS component that receives client queries (DoH/DoT) and selects a backend/adapter.
- **Gateway**: backend that resolves content pointers and/or serves content (e.g., IPFS/Filecoin/Arweave).
- **Namespace**: resolution domain class (ICANN DNS, ENS, SNS, HNS, PKDNS, IPFS, etc.).
- **Conformance Profile**: rules defining “correct behavior” for a backend (`docs/04-functional-equivalence-proofs.md`).
- **Policy State**: backend health state from watchdogs (`HEALTHY`, `DEGRADED`, `DISABLED`, `RECOVERING`).

---

## 2. Design Constraints

- Must support **fast path** operation with minimal overhead.
- Must not require per-request chain calls.
- Must be compatible with **policy-driven routing** and **automatic fallback**.
- Must expose **conformance hooks** for watchdog challenge sets.
- Must support privacy-preserving telemetry (bucketed metrics, not raw user logs).

---

## 3. Capabilities Model

Each adapter advertises a set of capabilities:

### 3.1 Capability Types
- `RECURSIVE_DNS` (ICANN/web2 recursion)
- `UPSTREAM_FORWARD` (forward to upstream recursors)
- `UPSTREAM_QUORUM` (multi-upstream agreement mode)
- `WEB3_NAME_RESOLUTION` (name → record/pointer)
- `ALT_ROOT_RESOLUTION` (Handshake/alt-root style)
- `DHT_RECORD_RESOLUTION` (PKDNS/PKARR style)
- `GATEWAY_RESOLUTION` (name/pointer → gateway route)
- `CONTENT_RETRIEVAL` (fetch bytes given pointer/CID)
- `CACHE_PROVIDER` (stores and serves cached RRsets/routes/content)
- `EDGE_INGRESS` (accepts DoH/DoT and enforces admission gating)

### 3.2 Namespace Support
An adapter MUST declare supported namespaces, e.g.:
- `ICANN_DNS`
- `ENS`
- `SNS_SOL`
- `UNSTOPPABLE`
- `HANDSHAKE`
- `PKDNS_PKARR`
- `IPFS`
- `FILECOIN`
- `ARWEAVE`
- `TOR_GATEWAY` (optional, policy-controlled)

---

## 4. Request / Response Types (Canonical)

This spec defines a canonical request and response model. Implementations may use language-specific structures, but MUST preserve semantics.

### 4.1 Canonical Request: `ResolutionRequest`
Fields:

- `request_id` (opaque string, unique per request)
- `timestamp_ms` (client/resolver timestamp; optional)
- `namespace` (string; required)
- `name` (string; required)
- `qtype` (string; required; e.g., `A`, `AAAA`, `CNAME`, `TXT`, `HTTPS`, `SVCB`, `ANY`)
- `transport` (string; e.g., `DOH`, `DOT`, `INTERNAL`)
- `client_region` (string; coarse region bucket; optional)
- `client_tier` (enum; optional):
  - `END_USER`
  - `BUSINESS`
  - `DEVELOPER`
  - `OPERATOR`
- `policy_version` (string/integer; required for auditable routing)
- `mode_flags` (set; optional):
  - `CACHE_FIRST`
  - `CACHE_ONLY`
  - `UPSTREAM_ONLY`
  - `QUORUM_MODE`
  - `ATTACK_MODE`
- `limits` (object; optional):
  - `max_latency_ms`
  - `max_response_bytes`
  - `max_upstream_queries`
- `payment_context` (opaque; optional):
  - voucher proofs are handled by ingress/resolver; adapter SHOULD NOT require them

### 4.2 Canonical Response: `ResolutionResponse`
Fields:

- `request_id` (must match)
- `status` (enum; required):
  - `OK`
  - `NXDOMAIN`
  - `NODATA`
  - `REFUSED`
  - `SERVFAIL`
  - `TIMEOUT`
  - `UNAVAILABLE`
  - `POLICY_BLOCKED`
- `answers` (list; optional):
  - standardized RRset objects (see 4.3)
- `authority` (list; optional)
- `additional` (list; optional)
- `ttl_bounds` (object; optional)
- `backend_metadata` (object; optional, must be safe):
  - `backend_id`
  - `adapter_id`
  - `served_from_cache` (bool)
  - `conformance_profile_id` (string)
  - `response_size_bytes`
- `receipts` (object; optional):
  - proof-of-serving receipt payload (see 7)
- `error_reason_code` (string; optional; coarse classification only)

### 4.3 RRset Object (DNS-Compatible)
RR objects must be representable as standard DNS RRsets:

- `name`
- `type`
- `ttl`
- `data` (type-dependent encoding)

Adapters that produce non-DNS outputs MUST translate them into DNS-compatible RRsets or into a gateway resolution object (see 4.4).

### 4.4 Gateway Resolution Output (Optional)
For content/pointer backends, adapter MAY return a `gateway_result`:

- `pointer_type` (e.g., `CID`, `TX_REF`, `CONTENTHASH`)
- `pointer_value`
- `gateway_routes` (ordered list):
  - `route_id`
  - `endpoint` (URL or endpoint descriptor)
  - `priority`
  - `policy_tags` (e.g., `CENTRALIZED_FALLBACK`, `DECENTRALIZED`)
- `integrity`:
  - expected hash/CID
  - validation rules reference

---

## 5. Required Adapter Methods

### 5.1 `describe() -> AdapterDescriptor` (REQUIRED)
Returns immutable-ish metadata:

- `adapter_id`
- `version`
- `capabilities`
- `supported_namespaces`
- `supported_qtypes`
- `conformance_profile_id(s)`
- `default_fallback_backend_set_id`
- `telemetry_schema_version`

### 5.2 `resolve(req: ResolutionRequest) -> ResolutionResponse` (REQUIRED)
Performs resolution per adapter logic and returns standardized response.

Rules:
- MUST respect `mode_flags` where applicable (`CACHE_ONLY` must never trigger upstream fetch).
- MUST fail fast if `policy_version` indicates the backend is `DISABLED`.
- SHOULD enforce `limits` to prevent runaway work.

### 5.3 `conformance_probe(probe: ConformanceProbe) -> ConformanceResult` (REQUIRED)
Used by watchdog verifiers to run deterministic checks.

- MUST be deterministic for a given probe input.
- MUST not depend on private user data.
- SHOULD support challenge-set IDs and test vectors.

---

## 6. Telemetry (Privacy-Preserving)

Adapters SHOULD export only aggregated/bucketed metrics:
- success rate buckets
- p95 latency buckets
- error class histograms
- cache hit ratio buckets
- response size buckets

Adapters MUST NOT export raw query logs by default.

---

## 7. Proof-of-Serving Receipt Hook (Optional but Recommended)

To support payouts, adapters MAY attach a service receipt:

### 7.1 Receipt Fields (Concept)
- `receipt_version`
- `backend_id`
- `operator_id` (or gateway/operator identifier)
- `request_hash` (hash of normalized request fields)
- `response_hash` (hash of normalized response summary)
- `served_bytes`
- `served_from_cache`
- `timestamp_bucket`
- `policy_version`
- `signature` (operator signature)

Receipts should be small, verifiable, and not leak user-specific metadata beyond what is necessary.

---

## 8. Fallback Semantics

Adapters MUST declare fallback behavior:
- fallback backend set ID(s)
- what constitutes a “hard fail” vs “soft fail”
- whether cache-only fallback is permitted
- which failures are retryable

Routing engine uses these declarations in combination with watchdog policy.

---

## 9. Security Requirements

- Adapters MUST validate any cryptographic material required by their namespace (signatures, content hashes) according to conformance profile rules.
- Adapters MUST implement strict input bounds to prevent resource exhaustion:
  - max label lengths, recursion depth, response sizes
- Adapters SHOULD support deterministic normalization to prevent cache poisoning.

---

## 10. Compliance / Policy Hooks

Adapters MUST support:
- `POLICY_BLOCKED` status for enforced blocks
- `error_reason_code` classification for auditability

Policy enforcement is governed by DAO rules and watchdog criteria.

---

## 11. Versioning

- This spec uses semantic versioning.
- Adapters MUST declare `adapter_id` and `version`.
- Backends should reference adapter versions immutably (registry pointer / NFT-like object), but allow new versions to be listed without deleting old ones.

---

## 12. References (Docs)

- Resolution backends: `docs/02-resolution-backends.md`
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Tokenomics: `docs/05-tokenomics.md`
- Routing engine: `docs/07-routing-engine.md`
