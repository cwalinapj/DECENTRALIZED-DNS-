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
- `GET /v1/names/config`
- `GET /v1/names/availability?name=<name>.dns`
- `POST /v1/names/register`
- `GET /healthz`

Example:

```bash
curl 'http://localhost:8054/v1/resolve?name=netflix.com&type=A'
curl 'http://localhost:8054/v1/resolve?name=example.dns&type=A'
curl 'http://localhost:8054/v1/names/availability?name=alice.dns'
```

Registration planning includes NFT issuance:

- Premium `.dns` names mint a canonical NFT to the owner wallet.
- Non-premium `.dns` names mint a canonical NFT into program custody.

Registration UI:

- `http://localhost:8054/dns-register/index.html`

## Env Vars (MVP)

| Variable | Default | Notes |
|---|---|---|
| `UPSTREAM_DOH_URL` | `https://cloudflare-dns.com/dns-query` | Single-upstream default used by legacy paths. |
| `UPSTREAM_DOH_URLS` | `https://cloudflare-dns.com/dns-query,https://dns.google/resolve` | Comma-separated upstream list used by recursive adapter. |
| `CACHE_PATH` | `gateway/.cache/rrset.json` | Local cache file path. |
| `STALE_MAX_S` | `1800` | Serve expired cache for up to this many seconds only on upstream error. |
| `PREFETCH_FRACTION` | `0.1` | Prefetch threshold: refresh when `time_left < max(5s, ttl*fraction)`. |
| `CACHE_MAX_ENTRIES` | `50000` | Max cache keys before oldest-entry eviction. |
| `REQUEST_TIMEOUT_MS` | `2000` | Upstream HTTP timeout. |
| `PORT` | `8054` | Gateway HTTP port. |
| `DDNS_REGISTRY_PROGRAM_ID` | auto from `solana/Anchor.toml` when available | PKDNS program id for `.dns` lookups. |
| `DDNS_WATCHDOG_POLICY_PROGRAM_ID` | auto from `solana/Anchor.toml` when available | Optional watchdog policy program for `.dns` policy reads. |
| `DDNS_WITNESS_URL` | unset | Optional resolve+verify witness for `.dns` names when no `dest` query param is supplied. |

## Run

```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/gateway
npm install
npm run build
PORT=8054 npm run dev
```

## Tests

```bash
npm test
```
