# client

## PURPOSE
The client section contains wallet-based apps (mobile, desktop, browser extension) plus gateway and storage agents. It is the user-facing layer that signs vouchers, manages keys, and interfaces with gateway/escrow.

## INVENTORY
- `apps/` – mobile/desktop/browser scaffolds
- `core/` – wallet SDK + keychain specs
- `gateways/` – DNS enforcer and proxy stubs
- `storage/` – compute/storage agent stubs
- `swarm/` – tunnel client stubs
- `client/README.md`, `layout*.md`
- Build tools: `client/package.json` (vitest)

## RUNNABILITY CHECK
**Status:** scaffold only; no runnable apps yet. Missing build configs for React Native, Tauri, and browser extension packaging.

## INTERFACE CONTRACT
Inputs:
- Wallet keys + voucher signing parameters.
Outputs:
- Signed vouchers, session tokens, and local policy decisions.

Adapters should use unified resolve outputs: `docs/sections/ADAPTER_INTERFACE.md`.

## SECURITY + RELIABILITY PASS
- No network calls yet.
- TODO: enforce key isolation and secure storage across platforms.

## TESTS
- `client/tests/structure.test.ts`
- `client/tests/specs.test.ts`

## DOCS
- `client/README.md` updated with tests.

## STATUS
- **Status:** stub
- **Commands tried:** `npm test`
- **Failures:** none

## TODO (priority)
1. Add real app scaffolds (React Native, Tauri, extension build system).
2. Implement voucher signing + session management SDK.
3. Add end-to-end wallet → gateway demo.
