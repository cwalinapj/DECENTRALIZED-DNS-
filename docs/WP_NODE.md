# WordPress Node (Cache/Witness)

## Purpose
WP nodes provide cache/witness endpoints for gateway results in safe mode. They do not store secrets or private keys.

## Plugin
Repository: `web3-wp-plugins/ddns-node`.

## Endpoints
- `GET /wp-json/ddns/v1/health`
- `GET /wp-json/ddns/v1/resolve?name=example.com`

## Behavior
- Uses transients for TTL caching.
- Verifies signatures/proofs if provided in response metadata.
- No private keys or signing in WordPress.

## Safe mode
Gateway can query N nodes + authoritative resolver, verify integrity, and accept by quorum.

## Config
- `config/example/nodes.json` lists node URLs.
