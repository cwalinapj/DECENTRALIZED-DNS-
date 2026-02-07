# Adapter: arweave (Gateway / Permanent Storage Retrieval)

This adapter retrieves content from Arweave via gateway operators, returning either DNS-compatible mappings or retrieval routes.

Namespace:
- `ARWEAVE`

Capabilities:
- `GATEWAY_RESOLUTION`
- `CONTENT_RETRIEVAL`

Key behaviors:
- resolve Arweave transaction IDs to gateway retrieval routes
- validate integrity where applicable (tx id mapping correctness per profile)
- cache-friendly behavior (content permanence assumptions are profile-defined)

Fallback:
- alternate gateways
- centralized gateways only under policy
- cache-only serving for previously validated content

Upstream reference:
- Arweave org: https://github.com/arweaveteam
