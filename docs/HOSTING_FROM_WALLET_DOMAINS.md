# Hosting From Wallet Domains (.eth / .sol) via IPFS or Arweave

This feature lets wallet domains point to content-addressed hosting targets and serve site bytes through the gateway.

Supported hosting targets:
- `ipfs://<CID>`
- `ar://<TX_ID>`

## How it works

1. Gateway resolves the wallet domain via ENS/SNS adapters.
2. Adapter returns normalized `dest` (`ipfs://...` or `ar://...`) plus proof metadata.
3. `GET /v1/site?name=<domain>` fetches bytes from IPFS/Arweave and returns safe static-hosting headers.

## ENS (.eth) record priority

Resolution order for hosting pointers:
1. `contenthash`
2. text `content`
3. text `ipfs`
4. text `arweave`
5. text `url`

Accepted text values:
- raw CID -> normalized to `ipfs://CID`
- raw Arweave tx -> normalized to `ar://TX`
- full `ipfs://...` / `ar://...` kept as-is

## SNS (.sol) record priority

Resolution order for hosting pointers:
1. text `content`
2. text `ipfs`
3. text `arweave`
4. text `url`

## Verify

```bash
# route answer with adapter proof
curl 'http://localhost:8054/v1/route?name=alice.eth'
curl 'http://localhost:8054/v1/route?name=alice.sol'

# serve site bytes
curl -i 'http://localhost:8054/v1/site?name=alice.eth'
curl -i 'http://localhost:8054/v1/site?name=alice.sol'
```

## Environment

- `IPFS_GATEWAY_BASE` (default `https://ipfs.io/ipfs`)
- `ARWEAVE_GATEWAY_BASE` (default `https://arweave.net`)
- `SITE_FETCH_TIMEOUT_MS` (default `5000`)
- `SITE_MAX_BYTES` (default `5242880` = 5 MB)

## Notes

- `/v1/site` is read-only.
- Non-hosting destinations return `400` with `error: not_hosting_target`.
- `.dns` PKDNS behavior is unchanged.
