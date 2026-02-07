# Backend Adapter Interface (Spec)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

This spec defines the **standard adapter interface** implemented by all TollDNS backends (ICANN DNS recursion, upstream quorum, Web3 naming systems, DHT record systems, gateways, and storage networks). A uniform interface allows the **routing engine**, **miners**, and **watchdogs** to treat integrations consistently and safely.

This is a **normative** specification unless stated otherwise.

Related:
- Backends overview: `docs/02-resolution-backends.md`
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Routing engine: `docs/07-routing-engine.md`
- Receipt spec: `specs/receipt-format.md`

---

## 1) Definitions

- **Backend**: a named integration target (e.g., ENS resolution, IPFS gateway retrieval, Handshake resolver).
- **Adapter**: the implementation module that speaks a backend’s protocol and returns standardized outputs.
- **Resolver**: TollDNS component that accepts DoH/DoT queries and selects adapters based on policy/routing.
- **Gateway**: backend type that resolves pointers and/or serves content (IPFS/Filecoin/Arweave/etc.).
- **Namespace**: resolution class (ICANN_DNS, ENS, SNS_SOL, HANDSHAKE, PKDNS_PKARR, IPFS, etc.).
- **Conformance Profile**: rules defining correct behavior for a backend surface (`docs/04-functional-equivalence-proofs.md`).
- **Policy State**: backend health state from watchdog policy (`HEALTHY`, `DEGRADED`, `DISABLED`, `RECOVERING`).

---

## 2) Non-Negotiable Constraints

Adapters MUST:
- be fast on the hot path (minimal overhead)
- avoid per-request blockchain calls
- be compatible with **policy-driven routing** and **automatic fallback**
- expose deterministic **conformance probe** hooks for watchdogs
- emit privacy-preserving telemetry (bucketed metrics only; no raw query logs by default)
- enforce strict bounds to prevent resource exhaustion and cache poisoning

---

## 3) Capability & Namespace Declaration

Every adapter MUST advertise:
- supported **capabilities**
- supported **namespaces**
- supported **qtypes** (where applicable)

### 3.1 Capability Types (Normative)
- `RECURSIVE_DNS` — native ICANN/web2 recursion
- `UPSTREAM_FORWARD` — forward to upstream recursors
- `UPSTREAM_QUORUM` — multi-upstream agreement mode
- `WEB3_NAME_RESOLUTION` — name → records/pointers
- `ALT_ROOT_RESOLUTION` — alt-root/TLD semantics (Handshake-style)
- `DHT_RECORD_RESOLUTION` — signed packets/records from DHT (PKDNS/PKARR-style)
- `GATEWAY_RESOLUTION` — pointer/name → gateway route(s)
- `CONTENT_RETRIEVAL` — fetch bytes for a pointer/CID/tx-ref
- `CACHE_PROVIDER` — stores/serves cached RRsets/routes/content
- `EDGE_INGRESS` — accepts DoH/DoT and enforces admission gating

### 3.2 Namespace Values (Examples)
Adapters MUST declare supported namespaces, e.g.:
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

## 4) Canonical Request / Response

Adapters MUST accept a canonical request and produce a canonical response. Implementations may use language-specific structs, but MUST preserve semantics.

### 4.1 Canonical Request: `ResolutionRequest`

Required fields:
- `request_id` (string) — unique per request
- `namespace` (string)
- `name` (string)
- `qtype` (string) — e.g., `A`, `AAAA`, `CNAME`, `TXT`, `HTTPS`, `SVCB`, `ANY`
- `transport` (string) — `DOH`, `DOT`, `INTERNAL`
- `policy_version` (string/int) — for auditable routing

Optional fields:
- `timestamp_ms` (int)
- `client_region` (string) — coarse region bucket only
- `client_tier` (enum): `END_USER` | `BUSINESS` | `DEVELOPER` | `OPERATOR`
- `mode_flags` (set):
  - `CACHE_FIRST`
  - `CACHE_ONLY`
  - `UPSTREAM_ONLY`
  - `QUORUM_MODE`
  - `ATTACK_MODE`
- `limits` (object):
  - `max_latency_ms`
  - `max_response_bytes`
  - `max_upstream_queries`
- `payment_context` (opaque):
  - vouchers are handled by ingress/resolver; adapters SHOULD NOT require or parse payment proofs

### 4.2 Canonical Response: `ResolutionResponse`

Required fields:
- `request_id` (must match request)
- `status` (enum):
  - `OK`
  - `NXDOMAIN`
  - `NODATA`
  - `REFUSED`
  - `SERVFAIL`
  - `TIMEOUT`
  - `UNAVAILABLE`
  - `POLICY_BLOCKED`

Optional fields:
- `answers` (list of RRsets)
- `authority` (list of RRsets)
- `additional` (list of RRsets)
- `ttl_bounds` (object)
- `backend_metadata` (object, safe only):
  - `backend_id`
  - `adapter_id`
  - `served_from_cache` (bool)
  - `conformance_profile_id` (string)
  - `response_size_bytes` (int)
- `receipts` (object) — proof-of-serving payload (see §7)
- `error_reason_code` (string) — coarse classification only (no sensitive details)

### 4.3 RRset Object (DNS-Compatible)
RRsets MUST be representable as standard DNS RRsets:
- `name`
- `type`
- `ttl`
- `data` (type-dependent encoding)

If a backend produces non-DNS-native outputs, the adapter MUST translate them into:
- DNS-compatible RRsets, OR
- a gateway result object (below)

### 4.4 Gateway Result (Optional)
For pointer/content backends, adapters MAY return `gateway_result`:

- `pointer_type` — e.g., `CID`, `TX_REF`, `CONTENTHASH`, `IPNS`
- `pointer_value`
- `gateway_routes` (ordered list):
  - `route_id`
  - `endpoint` (URL or endpoint descriptor)
  - `priority`
  - `policy_tags` (e.g., `DECENTRALIZED`, `CENTRALIZED_FALLBACK`)
- `integrity`:
  - expected hash/CID
  - validation rules reference (profile id)

---

## 5) Required Adapter Methods

### 5.1 `describe() -> AdapterDescriptor` (REQUIRED)
Returns immutable-ish metadata for registry and tooling:

- `adapter_id`
- `version`
- `capabilities`
- `supported_namespaces`
- `supported_qtypes`
- `conformance_profile_id(s)`
- `default_fallback_backend_set_id`
- `telemetry_schema_version`

### 5.2 `resolve(req: ResolutionRequest) -> ResolutionResponse` (REQUIRED)
Performs resolution and returns standardized response.

Normative rules:
- MUST honor mode flags:
  - `CACHE_ONLY` MUST NOT fetch upstream or do network retrieval
  - `UPSTREAM_ONLY` MUST NOT use local “native” resolution paths (if applicable)
- MUST enforce `limits` to prevent runaway work
- MUST fail fast when policy indicates DISABLED behavior (see note below)

**Policy note:** the adapter should not “invent” policy state. The resolver is expected to filter DISABLED backends via routing policy. Adapters SHOULD still provide a fast failure path if a resolver erroneously calls them in a disabled context.

### 5.3 `conformance_probe(probe: ConformanceProbe) -> ConformanceResult` (REQUIRED)
Used by watchdog verifiers to run deterministic checks.

Normative rules:
- MUST be deterministic for a given probe input
- MUST NOT depend on private user data
- SHOULD support challenge-set IDs and test vectors

---

## 6) Telemetry (Privacy-Preserving)

Adapters SHOULD export only aggregated metrics:
- success rate buckets
- p95 latency buckets
- error class histograms
- cache hit ratio buckets
- response size buckets

Adapters MUST NOT export raw query logs by default.

---

## 7) Proof-of-Serving Receipt Hook (Optional, Recommended)

To support operator payouts, adapters MAY attach a receipt payload consistent with:
- `specs/receipt-format.md`

Minimum recommended fields:
- `receipt_version`
- `backend_id`
- `operator_id`
- `request_hash` (normalized request hash; no raw names by default)
- `response_hash` (normalized response summary hash)
- `served_bytes`
- `served_from_cache`
- `timestamp_bucket`
- `policy_version`
- `signature`

Receipts MUST be small, verifiable, and privacy-preserving.

---

## 8) Fallback Semantics

Adapters MUST declare (via `describe()` and/or adapter config):
- fallback set ID(s)
- what counts as hard-fail vs soft-fail
- retryable error classes
- whether cache-only fallback is valid for this backend

Routing uses these declarations along with watchdog policy states.

---

## 9) Security Requirements (Normative)

Adapters MUST:
- validate cryptographic materials required by the namespace (signatures, content hashes, proofs)
- enforce strict input bounds:
  - max name/label lengths
  - max recursion depth / chain length
  - max response sizes
- normalize inputs deterministically (prevent poisoning and cache key confusion)
- apply conservative caching rules unless profile explicitly allows more aggressive caching

---

## 10) Compliance / Policy Hooks

Adapters MUST support:
- `POLICY_BLOCKED` outcomes when policy forbids serving a request/class
- `error_reason_code` as a coarse classification for auditing

Policy enforcement details are DAO-governed and driven by watchdog criteria.

---

## 11) Versioning

- This spec uses semantic versioning.
- Adapters MUST declare `adapter_id` and `version`.
- Backends should reference adapter versions immutably (registry pointer / NFT-like pointer), while allowing new versions to be listed without deleting old ones.

---

## 12) References

- Resolution backends: `docs/02-resolution-backends.md`
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Functional equivalence: `docs/04-functional-equivalence-proofs.md`
- Tokenomics: `docs/05-tokenomics.md`
- Routing engine: `docs/07-routing-engine.md`
- Receipt spec: `specs/receipt-format.md`
