# Adapter: ipfs (IPFS Gateway / Content Retrieval)

This adapter resolves IPFS-related pointers and supports content retrieval via gateway operators.

Namespace:

- `IPFS`

Capabilities:

- `GATEWAY_RESOLUTION`
- `CONTENT_RETRIEVAL`

Key behaviors:

- accept content pointers (CID, ipns, contenthash mappings)
- produce gateway route options (decentralized gateways preferred if healthy)
- validate integrity (CID/hash match) when serving content
- support cache-friendly behavior (immutable content)

Fallback:

- centralized gateways may be used only under policy (DEGRADED/DISABLED)
- cache-only serving for previously validated content (policy-controlled)

Conformance:

- integrity invariants (bytes served must match CID)
- redirect/content-type rules as defined by profile

Upstream reference:

- IPFS org: <https://github.com/ipfs>
