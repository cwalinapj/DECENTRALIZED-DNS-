# Adapter: dns-icann (Native ICANN/Web2 DNS)

This adapter resolves standard ICANN DNS using native recursion (DoH/DoT server-side) and returns DNS RRsets.

Namespace:
- `ICANN_DNS`

Capabilities:
- `RECURSIVE_DNS`
- `CACHE_PROVIDER` (optional: cache interface hooks)

Key behaviors:
- DNS recursion and caching
- optional DNSSEC validation (policy-defined)
- strict bounds (max recursion depth, max response size, max CNAME chain)

Fallback:
- if policy state is DEGRADED/DISABLED, route per `fallback_set_id` (usually upstream-forward or centralized resolver set)

Conformance:
- correctness defined by conformance profiles (see `docs/04-functional-equivalence-proofs.md`)
- challenge sets should include NXDOMAIN/NODATA semantics, CNAME chasing, TTL bounds

Related:
- Backend interface: `specs/backend-interface.md`
- Routing policy: `docs/07-routing-engine.md`
