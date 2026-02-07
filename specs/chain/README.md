# Chain Commitments (Index)

This directory contains chain-specific specifications for storing the minimal DECENTRALIZED-DNS commitments:

- `name_id -> (seq, exp, routeset_hash)`
- optional delegation: `name_id -> (g_seq, g_exp, gateway_routes_hash)`

## Invariants (apply to all chains)

### Core fields

- `name_id` is derived per `specs/records/NameNormalization.md`
- `routeset_hash = BLAKE3_256(RouteSetV1_bytes_including_sig)` per `specs/records/RouteSetV1.md`
- `seq` is monotonic (recommended strictly increasing)
- `exp` is unix seconds expiry and must be in the future at publish time

### Optional delegation fields

- `gateway_routes_hash = BLAKE3_256(GatewayRoutesV1_bytes_including_sig)` per `specs/records/GatewayRoutesV1.md`
- `g_seq` is monotonic (recommended strictly increasing)
- `g_exp` must be in the future at publish time

## Chain profiles

- See `EVM/commitments.md`
- See `Solana/commitments.md`
