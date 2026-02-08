# adapters

## PURPOSE
Adapters integrate external naming systems and storage networks into the DDNS resolution pipeline. They normalize external records into a unified resolve() output consumed by the gateway and clients.

## INVENTORY
- Provider folders: `arweave/`, `ipfs/`, `ens/`, `handshake/`, `unstoppable/`, `dns-icann/`, `dns-upstream-quorum/`, `pkdns-pkarr/`, `solana-sns-bonfida/`, `tor-odoH/`, `web3-name-gateway/`, `filecoin/`.
- Each provider has `config/`, `implementation/`, `conformance/`, `tests/` with README stubs.
- Build/tools: `adapters/package.json` (vitest).

## RUNNABILITY CHECK
**Status:** stubs only. No runnable adapter code yet.
**Missing:** actual `resolve()` implementations and provider clients.

## INTERFACE CONTRACT
All adapters must implement the unified interface described in `docs/sections/ADAPTER_INTERFACE.md`:
- `supports(name) -> boolean`
- `resolve(name, opts) -> { ok, records[] } | { ok:false, error{code,...} }`
- Timeouts: default 2s, max 1 retry for retryable errors.

## SECURITY + RELIABILITY PASS
- No code yet; ensure future adapters sanitize names, enforce TTL bounds, and implement timeout + error mapping.

## TESTS
- `adapters/tests/structure.test.ts` validates structure.
- `adapters/tests/interface.test.ts` validates interface doc existence.

## DOCS
- `adapters/README.md` updated with interface + test instructions.

## STATUS
- **Status:** stub
- **Commands tried:** `npm test`
- **Failures:** none (structure tests only)

## TODO (priority)
1. Implement resolve() for priority adapters (ENS, ICANN, IPFS).
2. Add provider-specific conformance tests.
3. Add timeout/retry wrappers per adapter.
