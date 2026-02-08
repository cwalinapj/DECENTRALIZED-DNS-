# Adapter Interface (Unified)

This repo uses a single response/error shape across all adapters/providers.
Adapters MUST conform to this for `resolve()` outputs.

## supports(name)
- Input: fully-qualified name string.
- Output: boolean.
- Should be strict and fast (string pattern only, no network IO).

## resolve(name, opts)
- Input:
  - `name` (string)
  - `opts`:
    - `timeout_ms` (number)
    - `trace_id` (string)
    - `cache_ok` (boolean)
- Output (success):
```json
{
  "ok": true,
  "adapter": "<adapter-id>",
  "name": "<original name>",
  "canonical_name": "<normalized name>",
  "records": [
    { "type": "A", "ttl": 60, "data": "203.0.113.10" },
    { "type": "AAAA", "ttl": 60, "data": "2001:db8::1" },
    { "type": "CNAME", "ttl": 60, "data": "alias.example" },
    { "type": "TXT", "ttl": 60, "data": "text" }
  ],
  "meta": {
    "source": "<provider>",
    "cache_ttl": 60,
    "retrieved_at_ms": 1700000000000
  }
}
```

- Output (error):
```json
{
  "ok": false,
  "adapter": "<adapter-id>",
  "name": "<original name>",
  "error": {
    "code": "TIMEOUT|NOT_FOUND|BAD_NAME|UPSTREAM|UNAUTHORIZED|UNSUPPORTED|INTERNAL",
    "message": "human readable",
    "retryable": true
  }
}
```

## Timeouts & retries
- Default timeout: 2000ms unless overridden.
- At most 1 retry on retryable errors (`TIMEOUT`, `UPSTREAM`).
- No retry for `BAD_NAME`, `UNAUTHORIZED`, `UNSUPPORTED`.

## Caching
- Honor provider TTL if present.
- Cap TTL to 1 hour unless adapter explicitly marks `cache_ok=false`.

## Notes
- Adapters should never throw raw errors upstream; always map to the error shape.
