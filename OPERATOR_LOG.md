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
- PR link: https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/55
- Merge commit hash: (to be added after merge)

## 2026-02-18T09:22:00Z — Branch: codex/rep-miner-integration
- Scope: PR-C miner integration for REP (`ddns_rep`) with node relay + cloudflare worker sender + CLI wiring.
- Commands run:
  - `npm -C services/miner-node install`
  - `npm -C services/miner-node run build`
  - `npm -C services/miner-node test`
  - `npm -C services/miner-worker-cloudflare install`
  - `npm -C services/miner-worker-cloudflare exec wrangler --version`
  - `npm -C solana run rep -- --help`
  - `cd solana && anchor build --program-name ddns_rep`
- Results:
  - miner-node build: PASS
  - miner-node test: PASS (`no tests yet` placeholder)
  - worker toolchain check: PASS (`wrangler --version`)
  - solana rep CLI compile/run: PASS (`--help` output)
  - ddns_rep anchor build: PASS
- PR link: https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/64
- Merge commit hash: pending

## 2026-02-18T09:35:00Z — Branch: codex/rep-miner-integration
- Scope: REP capability-tier extension (`MinerCapabilities`), test coverage updates (cooldown/cap/tier), docs for REP -> edge-host roadmap.
- Commands run:
  - `cd solana && anchor build --program-name ddns_rep`
  - `cd solana && cargo test -p ddns_rep`
  - `cd solana && anchor test --skip-build tests/ddns_rep.ts`
  - `npm -C services/miner-node run build`
  - `npm -C solana run rep -- status --help`
- Results:
  - ddns_rep build: PASS
  - ddns_rep cargo tests: PASS
  - workspace Anchor suite: ddns_rep tests PASS; suite has pre-existing unrelated failure in `ddns_miner_score` (DeclaredProgramIdMismatch)
  - miner-node build: PASS
  - rep CLI status command: PASS (`--miner` support visible)
- PR link: https://github.com/cwalinapj/DECENTRALIZED-DNS-/pull/64
- Merge commit hash: pending
