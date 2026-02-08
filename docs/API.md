# API

## GET /healthz
Returns a quick health response.

Response:
```json
{ "status": "ok" }
```

## GET /resolve
Resolve a name using the configured backend.

Query params:
- `name` (required): domain name to resolve.

Response (success):
```json
{
  "name": "example.com",
  "network": "icann",
  "records": [
    { "type": "A", "value": "203.0.113.10", "ttl": 60 }
  ],
  "metadata": { "source": "doh", "cache": "miss" }
}
```

Errors:
- 400: `{ "error": "missing_name" }`
- 402: `{ "error": { "code": "VOUCHER_REQUIRED", "message": "...", "retryable": true } }`
- 403: `{ "error": { "code": "VOUCHER_INVALID", "message": "...", "retryable": false } }`
- 501: `{ "error": { "code": "VOUCHER_NOT_IMPLEMENTED", "message": "...", "retryable": false } }`
- 502: `{ "error": { "code": "UPSTREAM_TIMEOUT" | "UPSTREAM_ERROR", "message": "...", "retryable": true } }`

Caching:
- In-memory TTL cache.
- Cache metadata includes `cache: "hit" | "miss"`.

Timeouts:
- Upstream DoH calls respect `REQUEST_TIMEOUT_MS` (default 2000ms).

Configuration:
- `PORT` (default `8054`)
- `UPSTREAM_DOH_URL` (default `https://cloudflare-dns.com/dns-query`)
- `REQUEST_TIMEOUT_MS` (default `2000`)
- `LOG_LEVEL` (`quiet` by default, `verbose` when `NODE_ENV=development`)
- `GATED_SUFFIXES` (default `.premium`, comma-separated)
- `VOUCHER_MODE` (`stub` by default, set to `memory` to enable in-process verifier)
- `VOUCHER_SECRET` (required when `VOUCHER_MODE=memory`)
