# API

## GET /healthz
Returns a quick health response.

Response:
```json
{ "status": "ok" }
```

## GET /registry/root
Returns the current registry Merkle root (when enabled).

Response:
```json
{ "root": "<hex>", "version": 1, "updatedAt": "..." }
```

## GET /registry/proof
Returns a Merkle inclusion proof for a name (when enabled).

Query params:
- `name` (required)

Response:
```json
{
  "root": "<hex>",
  "leaf": "<hex>",
  "proof": [{ "hash": "<hex>", "position": "left|right" }],
  "version": 1,
  "updatedAt": "..."
}
```

## POST /registry/anchor
Anchors a registry root (admin only).

Headers:
- `x-admin-token`: required when `REGISTRY_ADMIN_TOKEN` is set

Body:
```json
{
  "root": "<hex>",
  "version": 1,
  "timestamp": "2026-02-08T00:00:00Z",
  "source": "git:<sha>"
}
```

Response:
```json
{ "anchored": { "root": "...", "version": 1, "timestamp": "...", "source": "..." } }
```

## GET /resolve
Resolve a name using the configured backend.

Query params:
- `name` (required): domain name to resolve.
- `proof` (optional): `1` or `true` to include registry proof for `.dns`.

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
- 404: `{ "error": { "code": "NOT_FOUND", "message": "...", "retryable": false } }`
- 501: `{ "error": { "code": "REGISTRY_DISABLED", "message": "...", "retryable": false } }`
- 502: `{ "error": { "code": "UPSTREAM_TIMEOUT" | "UPSTREAM_ERROR", "message": "...", "retryable": true } }`

Caching:
- In-memory TTL cache.
- Cache metadata includes `cache: "hit" | "miss"`.

Timeouts:
- Upstream DoH calls respect `REQUEST_TIMEOUT_MS` (default 2000ms).

Configuration:
- `PORT` (default `8054`)
- `HOST` (default `0.0.0.0`)
- `UPSTREAM_DOH_URL` (default `https://cloudflare-dns.com/dns-query`)
- `REQUEST_TIMEOUT_MS` (default `5000`)
- `CACHE_TTL_MAX_S` (default `3600`)
- `LOG_LEVEL` (`quiet` by default, `verbose` when `NODE_ENV=development`)
- `GATED_SUFFIXES` (default `.premium`, comma-separated)
- `VOUCHER_MODE` (`stub` by default, set to `memory` to enable in-process verifier)
- `VOUCHER_SECRET` (required when `VOUCHER_MODE=memory`)
- `REGISTRY_ENABLED` (`1` to enable `.dns` registry + proof endpoints)
- `REGISTRY_PATH` (default `registry/snapshots/registry.json`)
- `REGISTRY_ADMIN_TOKEN` (required for `/registry/anchor`)
- `ANCHOR_STORE_PATH` (default `settlement/anchors/anchors.json`)
- `ENABLE_ENS` (`1` to enable `.eth`)
- `ETH_RPC_URL` (required for ENS)
- `ENS_NETWORK` (default `mainnet`)
- `ENABLE_SNS` (`1` to enable `.sol`)
- `SOLANA_RPC_URL` (default devnet)
- `SNS_CLUSTER` (default `devnet`)
- `NODE_AGGREGATOR_ENABLED` (`1` to enable WP node quorum)
- `NODE_LIST_PATH` (default `config/example/nodes.json`)
- `NODE_QUORUM` (default `3`)
