# Roadmap (MVP)

## MVP goals
- Name gateway `/resolve` API (done)
- Voucher + escrow integration (gated mode stub done)
- Basic caching + timeouts (done for gateway)

## Good first issues (with DoD)
1. ENS adapter (`adaptors/ens`)
   - DoD: add `implementation/adapter.json`, implement `supports/resolve`, update conformance tests, add unit tests for happy path.
   - Tests: `tests/conformance/adapter_contract.test.mjs` + adapter unit test.
2. SNS adapter (`adaptors/solana-sns-bonfida` or `adaptors/sns`)
   - DoD: same as ENS, includes sample resolution.
   - Tests: conformance + unit test with mocked RPC.
3. Handshake adapter (`adaptors/handshake`)
   - DoD: same as ENS, adds docs and example output.
   - Tests: conformance + unit test with mocked RPC.
4. Redis cache backend (`ddns-core` or `resolver/cache`)
   - DoD: optional Redis cache with TTL, fallback to in-memory on failure.
   - Tests: unit tests for cache hits/misses; smoke test for /resolve unchanged.
5. Internal `.dns` mapping backend
   - DoD: in-memory mapping store with CLI to add/remove entries, wired into resolver.
   - Tests: unit tests + smoke test.

## Test expectations
- `npm test` passes on a clean machine.
- Conformance tests must pass for all adapters.
- Smoke test must verify `/resolve` for ICANN without asserting exact IPs.
