# SNS Adapter (Bonfida)

## Overview
Resolves `.sol` names via the Solana Name Service. Returns at minimum:
- `OWNER` (base58 public key)

## Config
- `ENABLE_SNS=1` to enable resolver routing.
- `SOLANA_RPC_URL` (default `https://api.devnet.solana.com`).
- `SNS_CLUSTER` (`devnet` by default, informational metadata only).
- `REQUEST_TIMEOUT_MS` (default `2000`).

## Example
```bash
ENABLE_SNS=1 SOLANA_RPC_URL=https://api.devnet.solana.com \
  ./scripts/dev.sh
```

```bash
curl "http://localhost:8054/resolve?name=bonfida.sol"
```

## Responses
If unset:
- 404 with `NOT_FOUND`.

If upstream fails:
- 502 with `UPSTREAM_TIMEOUT` or `UPSTREAM_ERROR`.

## Tests
- Unit tests run by default with mocked RPC.
- Integration tests only run with `RUN_INTEGRATION=1`.
