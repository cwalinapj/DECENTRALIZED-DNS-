# Adapter: handshake (Alt-root / TLD Resolution)

This adapter resolves Handshake names (alt-root / TLD layer) and maps them into DNS-compatible outputs.

Namespace:
- `HANDSHAKE`

Capabilities:
- `ALT_ROOT_RESOLUTION`

Key behaviors:
- query Handshake resolver (e.g., hnsd) and translate records
- enforce conformance semantics for supported RR types
- bounded recursion/chasing rules as defined by profile

Fallback:
- policy may disable Handshake namespace resolution if unhealthy
- ICANN DNS remains independent and separate (do not silently merge semantics)

Upstream references:
- Handshake org: https://github.com/handshake-org
- hnsd: https://github.com/handshake-org/hnsd
