# Roadmap (MVP)

## MVP goals
- Name gateway `/resolve` API (done)
- Voucher + escrow gated mode (stub done)
- Registry + Merkle proofs (done for `.dns`)
- ENS + SNS adapters (implemented behind flags)

## Release tag
- `v0.1.0-mvp`: dev.sh + `/resolve` + docker dev harness + ENS/SNS + `.dns` registry/proofs.

## Good first issues (with DoD)
1. ENS adapter integration test
   - DoD: integration test with `RUN_INTEGRATION=1` passes against a live RPC.
   - Tests: `resolver/tests/ens.test.ts` integration block.
2. SNS adapter integration test
   - DoD: integration test with `RUN_INTEGRATION=1` passes against devnet.
   - Tests: `resolver/tests/sns.test.ts` integration block.
3. Handshake adapter (`adaptors/handshake`)
   - DoD: implement adapter with mocked tests, update conformance.
4. Redis cache backend (`ddns-core` or `resolver/cache`)
   - DoD: optional Redis cache with TTL, fallback to in-memory on failure.
5. Internal `.dns` CLI improvements
   - DoD: add optional signed update verifier for different wallet types.

## Test expectations
- `npm test` passes on a clean machine.
- Conformance tests must pass for all adapters.
- Smoke test verifies `/resolve` for ICANN without asserting exact IPs.
