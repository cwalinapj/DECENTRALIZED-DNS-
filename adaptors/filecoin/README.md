# Adapter: filecoin (Retrieval / Storage Network Gateway)

This adapter supports retrieving content through Filecoin-based retrieval and/or gateway providers.

Namespace:
- `FILECOIN`

Capabilities:
- `GATEWAY_RESOLUTION`
- `CONTENT_RETRIEVAL`

Key behaviors:
- translate TollDNS pointer requests into Filecoin retrieval routes
- choose among gateway/retrieval operators via routing policy
- validate returned content integrity (hash/CID expectations per profile)

Fallback:
- alternate retrieval providers
- centralized gateways (only under policy)
- cache-only for previously validated content (policy-controlled)

Upstream reference:
- Filecoin org: https://github.com/filecoin-project
