# Adapter: dns-upstream-quorum (Forwarding + Quorum Correctness)

This adapter forwards DNS queries to a configured set of upstream recursive DNS providers and optionally requires N-of-M agreement before returning or caching results.

Namespace:

- `ICANN_DNS`

Capabilities:

- `UPSTREAM_FORWARD`
- `UPSTREAM_QUORUM`

Use cases:

- bootstrapping reliability (early phases)
- correctness cross-checking when native recursion is immature
- safer cache population (quorum-based cache fills)

Key behaviors:

- configurable upstream set (e.g., Cloudflare/Google/others)
- quorum rules (N-of-M, majority, weighted)
- response normalization and comparison rules
- bounded fanout (avoid amplification)

Fallback:

- if quorum fails, return SERVFAIL or use single-upstream fallback per policy

Conformance:

- challenge sets should include behavior under disagreement and tie cases
- ensure NXDOMAIN/NODATA semantics are handled correctly

Related:

- Backends: `docs/02-resolution-backends.md`
- Routing: `docs/07-routing-engine.md`
