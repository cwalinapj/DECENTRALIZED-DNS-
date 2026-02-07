# Adapter: unstoppable (Unstoppable Domains)

This adapter resolves Unstoppable Domains to records and content pointers according to the supported surface.

Namespace:

- `UNSTOPPABLE`

Capabilities:

- `WEB3_NAME_RESOLUTION`

Key behaviors:

- resolve supported UD naming outputs into DNS-compatible responses
- enforce conformance profile semantics
- support caching with conservative bounds

Fallback:

- centralized resolution services or RPCs only when policy allows
- cache-only under incident rules (policy-controlled)

Upstream reference:

- Resolution SDK: <https://github.com/unstoppabledomains/resolution>
