# ddns-core

## PURPOSE
`ddns-core` is the shared core library for name normalization, record encodings, and signature verification used by resolver, adapters, and watchdogs. It defines the canonical data formats for RouteSet/Anchor/GatewayRoutes.

## INVENTORY
- Entry: `ddns-core/src/index.ts`
- Core files: `normalize.ts`, `name_id.ts`, `outeset.ts`, `anchor.ts`, `gateway_routes.ts`, `rr_helpers.ts`
- Tests: `ddns-core/tests/*.test.ts`
- Build tools: `package.json`, `tsconfig.json`, `vitest`

## RUNNABILITY CHECK
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/ddns-core
npm install
npx vitest run
```
**Result:** tests pass locally.

## INTERFACE CONTRACT
Inputs/Outputs:
- `normalizeDnsLabel(label) -> string`
- `encodeRouteSetV1(rs) -> Uint8Array`
- `decodeRouteSetV1(bytes) -> RouteSetV1`
- `buildAnchorV1(...) -> bytes`
- `encodeGatewayRoutesV1(...) -> bytes`
- `rrA/rrAAAA/rrCNAME/rrTXT` for DNS RR data.

Adapter response/error shape: see `docs/sections/ADAPTER_INTERFACE.md`.

## SECURITY + RELIABILITY PASS
- No network calls.
- Validation checks for lengths, ranges, and record constraints.

## TESTS
- `tests/routeset_anchor.test.ts`
- `tests/gateway_routes.test.ts`
- `tests/rr_helpers.test.ts`

## DOCS
- `ddns-core/README.md` updated with run instructions.

## STATUS
- **Status:** working
- **Commands tried:** `npx vitest run`
- **Failures:** none

## TODO (priority)
1. Add canonicalization tests for GatewayRoutes.
2. Add fuzz tests for wire encoding.
