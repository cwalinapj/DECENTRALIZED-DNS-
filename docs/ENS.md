# ENS Adapter

## Overview
Resolves `.eth` names via Ethereum JSON-RPC. Uses the ENS registry to discover the resolver, then reads:
- `addr` (ETH address)
- `contenthash` (if set)

## Config
- `ENABLE_ENS=1` to enable resolver routing.
- `ETH_RPC_URL` (required when enabled).
- `ENS_NETWORK` (default `mainnet`, informational metadata only).
- `REQUEST_TIMEOUT_MS` (default `2000`).

## Example
```bash
ENABLE_ENS=1 ETH_RPC_URL=https://eth-mainnet.example.com \
  ./scripts/dev.sh
```

```bash
curl "http://localhost:8054/resolve?name=vitalik.eth"
```

## Responses
If unset:
- 404 with `NOT_FOUND`.

If upstream fails:
- 502 with `UPSTREAM_TIMEOUT` or `UPSTREAM_ERROR`.

## Tests
- Unit tests run by default with mocked RPC.
- Integration tests only run with `RUN_INTEGRATION=1`.
