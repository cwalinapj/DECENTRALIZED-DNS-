# Work Breakdown (MVP → Beta): Make TollDNS Usable for Real Projects

Repo: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This document breaks the project into **shippable modules** so multiple contributors can work in parallel. The immediate goal is an MVP that the maintainer can use for real projects (and eventually Origin OS) without relying on a single centralized edge provider.

Guiding principles:

- **Domain/DNS-first** control plane (hosted properties are proxy-only behind the edge).
- **Run it locally in < 30 minutes** using Docker.
- **Small PRs** with tests and a clear Definition of Done.

---

## 0) MVP Definition (What “usable” means)

**MVP v0.1 must:**

1) Run locally: `docker compose up --build`
2) Provide a working gateway endpoint:
   - DoH (HTTP) with cache
   - upstream forwarding + quorum option
3) Provide a working gateway endpoint:
   - route pointers (IPFS first) → gateway routes
   - fetch via at least one route (optional for v0.1, recommended for v0.2)
4) Enforce policy states (config-first):
   - HEALTHY / DEGRADED / DISABLED
   - automatic fallback behavior
5) Provide “proof-of-serving” receipts (stub acceptable in v0.1):
   - deterministic request/response hashing
   - signature verification tests

**Non-goals for MVP:** full L2 blockchain, DAO UI, full mail stack, router firmware.

---

## 1) Module Map (Owners Wanted)

### A) Gateway Service (DoH/DoT + Cache)

**Path:** `/services/gateway/`  
**Priority:** P0  
**Definition of Done**

- `GET /health` returns OK
- DoH endpoint works for `example.com A`
- Caching works (basic in-memory acceptable for v0.1)
- Configurable upstream list
- Unit tests for request parsing + caching behavior

**Issues to open**

- “Gateway: DoH JSON endpoint + cache”
- “Gateway: wireformat DoH (RFC8484) support”
- “Gateway: DoT endpoint (optional v0.2)”

---

### B) Upstream Quorum Adapter (N-of-M)

**Path:** `/adapters/dns-upstream-quorum/`  
**Priority:** P0  
**Definition of Done**

- Queries N upstream resolvers concurrently with timeouts
- Picks a majority / quorum result (policy-configurable)
- Normalizes answers deterministically
- Unit tests for quorum decision logic + timeout behavior

---

### C) Policy Engine (Config-first → On-chain later)

**Path:** `/internal/policy/`  
**Priority:** P0  
**Definition of Done**

- Reads a local policy config (YAML/JSON)
- Produces effective backend states (HEALTHY/DEGRADED/DISABLED)
- Exposes a simple API to gateway/gateway: “is backend allowed?” “preferred fallback set?”
- Unit tests for state transitions

---

### D) Receipt / Proof-of-Serving (MVP stub)

**Path:** `/internal/receipts/` and `specs/receipt-format.md`  
**Priority:** P0  
**Definition of Done**

- Implements receipt struct matching `specs/receipt-format.md`
- Deterministic request hash + response hash
- Operator signature generation + verification test
- Gateway attaches receipt to response metadata (behind config flag)

---

### E) Gateway Service (Routing + IPFS adapter first)

**Path:** `/services/gateway/` and `/adapters/ipfs/`  
**Priority:** P1  
**Definition of Done**

- `GET /health` returns OK
- `GET /v1/resolve-adapter?...` returns a normalized adapter `RouteAnswer`
- Adapter interface implemented per `specs/backend-interface.md`
- Unit tests for route selection and adapter wiring

**v0.2 add-ons**

- Content retrieval endpoint: `/ipfs/<CID>`
- Cache objects and serve cache-only under incident policy

---

### F) Watchdogs (Probers + Incident detector) — Minimal

**Path:** `/watchdogs/`  
**Priority:** P1  
**Definition of Done**

- A small prober that checks gateway/gateway availability and emits a health report
- Output matches `specs/health-report-format.md`
- Can be run in Docker as a separate container

---

### G) Workers-lite (Forms/Webhooks) — Optional in MVP

**Path:** `/services/workers/`  
**Priority:** P2  
**Definition of Done**

- A single template: “form submit → forward to webhook”
- Strict allowlisted egress
- Rate limiting
- Tests for request validation + forwarding logic

---

### H) Docs + Developer Experience

**Priority:** P0  
**Definition of Done**

- `docs/QUICKSTART.md` works
- Adapter examples exist (`specs/examples/`)
- CI passes (markdownlint at minimum)

---

## 2) Suggested PR Order (Fastest to “usable”)

1) Gateway skeleton + DoH JSON endpoint + health
2) Upstream forwarding + cache
3) Upstream quorum adapter
4) Policy engine (config-first) and fallback wiring
5) Receipt generation + verification tests
6) Gateway routing API + IPFS adapter
7) Watchdog prober emitting health reports
8) (Optional) Workers-lite template

---

## 3) “Good First Issues” (1–2 hour tasks)

- Add a `docker compose` healthcheck block for gateway/gateway
- Add a minimal config loader (YAML/JSON) for policy module
- Add adapter example docs for a new namespace
- Add curl-based e2e smoke test script (`scripts/smoke.sh`)
- Add a `make docs` target and CI step

---

## 4) Ownership Slots (Optional)

If you want to claim a module, open an issue titled:

- “Owner: <Module Name>” and list what you will ship in 1–2 PRs.

---
