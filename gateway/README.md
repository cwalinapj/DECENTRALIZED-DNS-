# Gateway Resolver (MVP)

Resolver behavior is split by namespace:

- `.dns` names are handled by **PKDNS** (Solana-backed path).
- Non-`.dns` ICANN names are handled by **recursive DoH** with local TTL cache.
- ICANN pass-through answers are never written into canonical on-chain consensus.

Cache behavior for ICANN names:

- TTL-respecting local cache (`qname:qtype` key)
- stale-if-error fallback
- prefetch near expiry
- bounded eviction when cache exceeds max entries

## Endpoints

- `GET /v1/resolve?name=<domain>&type=A|AAAA`
- `GET /v1/route?name=<domain>[&dest=<candidate>]`
- `GET /healthz`

Example:

```bash
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
```

## Env Vars (MVP)

| Variable | Default | Notes |
|---|---|---|
| `UPSTREAM_DOH_URL` | `https://cloudflare-dns.com/dns-query` | Single-upstream default used by legacy paths. |
| `UPSTREAM_DOH_URLS` | `https://cloudflare-dns.com/dns-query,https://dns.google/dns-query` | Comma-separated upstream list used by recursive adapter. |
| `CACHE_PATH` | `gateway/.cache/rrset.json` | Local cache file path. |
| `STALE_MAX_S` | `1800` | Serve expired cache for up to this many seconds only on upstream error. |
| `PREFETCH_FRACTION` | `0.1` | Prefetch threshold: refresh when `time_left < max(5s, ttl*fraction)`. |
| `CACHE_MAX_ENTRIES` | `50000` | Max cache keys before oldest-entry eviction. |
| `REQUEST_TIMEOUT_MS` | `5000` | Upstream HTTP timeout. |
| `PORT` | `8054` | Gateway HTTP port. |

## Run

```bash
cd gateway
npm install
npm run build
PORT=8054 npm start
```

## Tests

```bash
npm test
```
