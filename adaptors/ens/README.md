# Adapter: ens (Ethereum Name Service)

This adapter resolves ENS names to records and/or content pointers, and maps results into DNS-compatible outputs (RRsets) and/or gateway routes.

Namespace:

- `ENS`

Capabilities:

- `WEB3_NAME_RESOLUTION`

Key behaviors:

- resolve ENS records (address, text, contenthash, etc.) within supported surface
- apply conformance profile rules for normalization and record mapping
- optionally support resolver-side caching for hot entries (TTL/policy-controlled)

Fallback:

- centralized RPC providers may be used temporarily under policy
- cache-only operation may apply during incidents (policy-controlled)

Upstream reference:

- ENS org: <https://github.com/ensdomains>
