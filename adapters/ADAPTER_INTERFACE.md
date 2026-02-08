# Adapter Interface (MVP)

Adapters provide name resolution for a specific network (ICANN, ENS, SNS, Handshake, etc.).

## Interface
An adapter must expose:

- `supports(name: string): boolean`
- `resolve(name: string): Promise<ResolveResponse>`

`ResolveResponse` (see `core/src/resolve_schema.ts`):
```ts
type ResolveRecord = { type: string; value: string; ttl?: number };

type ResolveResponse = {
  name: string;
  network: string;
  records: ResolveRecord[];
  metadata: Record<string, unknown>;
};
```

## Error codes
Standard error codes (see `core/src/error_codes.ts`):
- `missing_name`
- `NOT_FOUND`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_ERROR`
- `VOUCHER_REQUIRED`
- `VOUCHER_INVALID`
- `VOUCHER_NOT_IMPLEMENTED`

## Adapter descriptor
Each adapter MUST include `implementation/adapter.json` describing its status and a response example.
Conformance tests validate this file for every adapter.
