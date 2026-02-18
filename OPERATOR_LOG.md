# Operator Log

## 2026-02-18T08:12:45Z — Branch: codex/gateway-recursive-cache
- Scope: Add recursive DoH adapter + TTL cache path for non-.dns resolution in gateway.
- Commands run:
  -     \?? OPERATOR_LOG.md
  -     \codex/gateway-recursive-cache
  -     \
> ddns-resolver@0.1.0 test
> vitest run


 RUN  v4.0.18 /Users/root1/scripts/ddns-gateway-recursive/gateway

 ✓ tests/adapters_registry.test.ts (3 tests) 4ms
 ✓ tests/sns.test.ts (2 tests) 5ms
 ✓ tests/pkdns_adapter.test.ts (3 tests) 58ms
 ✓ tests/ens.test.ts (2 tests) 137ms
 ✓ tests/route_answer.test.ts (2 tests) 261ms
 ✓ tests/registry.test.ts (3 tests) 221ms
 ✓ tests/anchor.test.ts (1 test) 269ms
 ✓ tests/resolve.test.ts (5 tests) 270ms

 Test Files  8 passed (8)
      Tests  21 passed (21)
   Start at  00:12:45
   Duration  467ms (transform 512ms, setup 0ms, import 927ms, tests 1.23s, environment 1ms)
  -     \
> ddns-resolver@0.1.0 build
> tsc -p tsconfig.json
- Tests/build results:
  - gateway tests: PASS (8 files, 21 tests)
  - gateway build: PASS (tsc)
- PR link: (to be added after PR create)
- Merge commit hash: (to be added after merge)
