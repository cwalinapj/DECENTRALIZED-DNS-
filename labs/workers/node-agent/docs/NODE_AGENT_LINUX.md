# Node Agent (Linux)

## What It Does
- Runs as a systemd daemon.
- Prefetches hot names from the resolver and caches verified responses.
- Verifies Merkle proofs when provided in resolver metadata.
- Serves cached answers on `GET /resolve?name=...`.
- Posts signed receipts to the coordinator for SERVE/VERIFY events.

## Build
```bash
cargo build --release
```

Binary output:
- `target/release/ddns-node`

## Quick Start (Local)
```bash
# create default config + keypair
./target/release/ddns-node init --config ./config.local.json

# edit config.local.json for your resolver/coordinator
./target/release/ddns-node run --config ./config.local.json
```

## Install as a Service
```bash
./scripts/install-node.sh
```

This will:
- create `ddns-node` system user
- install config in `/etc/ddns-node/config.json`
- install systemd unit at `/etc/systemd/system/ddns-node.service`

## Config
Example: `config/config.example.json`

Key fields:
- `listen_addr`: bind address for HTTP server (default `0.0.0.0:8088`)
- `data_dir`: stores keypair under `keys/`
- `coordinator_url`: POST endpoint for receipts
- `resolver_url`: authoritative resolver `/resolve`
- `hot_names`: list of names to prefetch
- `prefetch_interval_seconds`: how often to refresh cache
- `request_timeout_ms`: outbound HTTP timeout
- `max_cache_items` / `max_cached_bytes`: cache limits
- `rate_limit_rps`: inbound rate limit
- `registry.enabled`: if true, poll `/registry/root`

## Endpoints
- `GET /healthz` -> `{ "status": "ok" }`
- `GET /resolve?name=example.com` -> cached response or 404
- `POST /audit` -> stub response (not implemented yet)

## Receipts
Receipts are posted to the coordinator at `coordinator_url` in this envelope:
```json
{
  "receipt": {
    "type": "SERVE",
    "node_id": "base64(pubkey)",
    "ts": 1738920000,
    "request": {"name": "example.com"},
    "result_hash": "blake3base64(...)"
  },
  "signature": "base64(ed25519sig)",
  "public_key": "base64(ed25519pub)"
}
```

## Logs
Use `journalctl -u ddns-node -f` when running as a service.
