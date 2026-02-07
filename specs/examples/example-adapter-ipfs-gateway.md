# Example Adapter — IPFS Gateway (Illustrative)

This example shows an adapter that supports:
- `GATEWAY_RESOLUTION`
- `CONTENT_RETRIEVAL` (optional)
- namespace `IPFS`

## describe()

- capabilities:
  - `GATEWAY_RESOLUTION`
  - `CONTENT_RETRIEVAL` (if adapter fetches bytes)
- supported_namespaces:
  - `IPFS`

## resolve(req)

If req asks for a DNS record:
- return DNS-compatible RRsets (e.g., TXT containing content pointer) OR
- return a `gateway_result` when pointer is known/derived.

If returning `gateway_result`:
- `pointer_type = CID`
- `gateway_routes` include:
  - TollDNS-operated gateways
  - partner gateways (policy-tagged)
  - centralized fallbacks (bootstrap only; policy-tagged)

## Partner tolling notes

If a partner gateway requires per-gateway tolls:
- route includes metadata indicating a toll schedule applies
- routing engine decides whether:
  - user pays (Index Units) or
  - TollDNS subsidy pool pays (Index Units)

See `docs/02-resolution-backends.md` “Gateway Tolls and Partner-Controlled Routing”.
