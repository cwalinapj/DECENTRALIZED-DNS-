# Adapter: tor-odoH (Tor-Oriented / Privacy-Preserving DoH Mode)

This adapter represents a privacy-oriented routing mode (e.g., onion-routed DoH, or policy-controlled Tor gateway usage).

Namespace:

- may apply to `ICANN_DNS` and/or gateway namespaces depending on implementation

Capabilities:

- `EDGE_INGRESS` (privacy mode)
- optional: `GATEWAY_RESOLUTION` / `CONTENT_RETRIEVAL`

Important:

- This integration is **policy-controlled** and DAO-governed.
- Abuse prevention and compliance rules apply.
- The adapter MUST avoid leaking user metadata and should prioritize privacy-preserving telemetry.

Fallback:

- standard DoH/DoT paths when Tor-mode is degraded or disabled by policy.

Note:

- This README defines intent and scope; exact implementation details depend on governance policy and threat model.
