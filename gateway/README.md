# Gateway (MVP)

## Resolver behavior
- `.dns` names are resolved through **PKDNS** first (on-chain canonical/hash verification path).
- Non-`.dns` ICANN names use **recursive DoH** with local TTL cache.
- ICANN answers are never written into canonical consensus; they are local gateway cache state only.

## Recursive quorum (ICANN)
- Upstreams are queried in parallel (default: Cloudflare + Google).
- Confidence levels:
  - `high`: normalized RRset hash quorum match.
  - `medium`: upstream sets overlap (CDN rotation tolerance).
  - `low`: only one usable upstream or disagreement.
- TTL policy:
  - base TTL = minimum upstream TTL for chosen RRset.
  - caps: `high -> TTL_CAP_S`, `medium -> min(TTL_CAP_S,120)`, `low -> min(TTL_CAP_S,30)`.
  - NXDOMAIN TTL is capped to 30 seconds.

## Cache behavior
- Keyed by `name:qtype`.
- Supports stale-if-error (`STALE_MAX_S`) and prefetch (`PREFETCH_FRACTION`).
- Cache file defaults to `gateway/.cache/rrset.json`.

## API
- `GET /v1/resolve?name=<domain>&type=A|AAAA`

Response keys:
- `name`, `type`, `answers`, `ttl_s`
- `source` (`recursive`)
- `confidence`
- `upstreams_used[]`, `chosen_upstream`
- `cache` (`hit`, `stale_used?`)
- `status`, `rrset_hash`

## Env (recursive)
- `RECURSIVE_UPSTREAMS` (default `https://cloudflare-dns.com/dns-query,https://dns.google/dns-query`)
- `RECURSIVE_QUORUM_MIN` (default `2`)
- `RECURSIVE_TIMEOUT_MS` (default `2000`)
- `RECURSIVE_MAX_CONCURRENCY` (default `3`)
- `RECURSIVE_OVERLAP_RATIO` (default `0.34`)
- `TTL_CAP_S` (default `300`)
- `CACHE_PATH` (default `gateway/.cache/rrset.json`)
- `STALE_MAX_S` (default `1800`)
- `PREFETCH_FRACTION` (default `0.1`)
- `CACHE_MAX_ENTRIES` (default `50000`)
