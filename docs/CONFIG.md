# Configuration

## Resolver
- `HOST`: bind address (default `0.0.0.0`)
- `PORT`: listen port (default `8054`)
- `UPSTREAM_DOH_URL`: DoH upstream (default Cloudflare)
- `REQUEST_TIMEOUT_MS`: upstream timeout (default `5000`)
- `CACHE_TTL_MAX_S`: max TTL for cache (default `3600`)
- `LOG_LEVEL`: `quiet|verbose`

## Registry
- `REGISTRY_ENABLED`: `1` to enable `.dns` registry
- `REGISTRY_PATH`: registry snapshot file (default `registry/snapshots/registry.json`)
- `ANCHOR_STORE_PATH`: anchor store file (default `settlement/anchors/anchors.json`)
- `REGISTRY_ADMIN_TOKEN`: admin token for `/registry/anchor`

## Adapters
- `ENABLE_ENS`: enable ENS adapter
- `ETH_RPC_URL`: RPC URL for ENS
- `ENS_NETWORK`: ENS network (default `mainnet`)
- `ENABLE_SNS`: enable SNS adapter
- `SOLANA_RPC_URL`: RPC URL for SNS
- `SNS_CLUSTER`: `devnet|mainnet`

## Node Aggregator
- `NODE_AGGREGATOR_ENABLED`: `1` to enable WP node quorum
- `NODE_LIST_PATH`: JSON list of node URLs
- `NODE_QUORUM`: integer quorum
