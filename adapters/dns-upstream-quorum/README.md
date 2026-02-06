# DNS Upstream Quorum Adapter

## What it resolves
- Standard ICANN domains using a configurable upstream recursor list.

## Upstream list selection
- The upstream list is configured per policy (e.g., Cloudflare, Google, Quad9, regional ISPs).
- Entries are chosen for geographic diversity and independent operators.
- The list can be weighted by trust score or regional performance.

## Agreement rules
- A query is considered correct when **N-of-M** upstreams agree on the answer.
- Agreement can be majority, weighted, or per-qtype rules.
- DNSSEC answers prefer deterministic validation; non-DNSSEC use quorum agreement.

## What gets cached and why
- Cache positive RRsets and negative responses that meet quorum agreement.
- Cache entries include a quorum proof summary (upstream hashes + timestamps).
- Caching reduces upstream dependency and provides historical auditability.

## Watchdog checks
- Success rate and p95 latency across the upstream set.
- Agreement ratio (quorum success vs. divergence).
- Safety checks for malformed or inconsistent upstream answers.

## Fallback mapping
- If quorum fails, fall back to the healthiest single upstream for continuity.
- If upstream list is degraded, return cache-only responses when safe.
