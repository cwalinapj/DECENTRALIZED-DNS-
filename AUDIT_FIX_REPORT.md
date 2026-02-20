# Audit Fix Report (Safe-Only MVP Hygiene)

Date (UTC): 2026-02-20
Branch: `codex/pr-audit-fix-safe`
Base: `origin/main`

## Scope
- Safe dependency hygiene only (`npm audit fix` without `--force`)
- No protocol/spec behavior changes
- No Solana program source changes

## Baseline Validation
Commands run:
```bash
npm ci && npm test
npm -C gateway ci && npm -C gateway run lint && npm -C gateway run build && npm -C gateway test
npm -C core ci && npm -C core run build && npm -C core test
npm -C coordinator ci && npm -C coordinator test
npm -C packages/attack-mode ci && npm -C packages/attack-mode run build && npm -C packages/attack-mode test
```
Result: PASS

## Vulnerability Summary (before -> after)
- root: `0 -> 0`
- gateway: `5 (1 moderate, 4 high) -> 4 (0 moderate, 4 high)`
- core: `5 (moderate) -> 5 (moderate)`
- coordinator: `0 -> 0`
- packages/attack-mode: `5 (moderate) -> 5 (moderate)`

Artifacts:
- `artifacts/audit_root_before.json`, `artifacts/audit_root_after.json`
- `artifacts/audit_gateway_before.json`, `artifacts/audit_gateway_after.json`
- `artifacts/audit_core_before.json`, `artifacts/audit_core_after.json`
- `artifacts/audit_coordinator_before.json`, `artifacts/audit_coordinator_after.json`
- `artifacts/audit_packages_attack-mode_before.json`, `artifacts/audit_packages_attack-mode_after.json`

## What Was Fixed (safe)
- `gateway/package-lock.json`
  - `bn.js` patch bump: `5.2.2 -> 5.2.3`
- Net effect: removed one moderate vulnerability in `gateway`.

## Deferred (requires major/breaking upgrades)
### gateway
- `@bonfida/spl-name-service` transitive chain (`@solana/spl-token`, `@solana/buffer-layout-utils`, `bigint-buffer`)
- Fix path is semver-major (`@bonfida/spl-name-service` major change), deferred for non-MVP-safe wave.

### core + packages/attack-mode
- `vitest`/`vite`/`vite-node`/`esbuild` advisories
- Fix path is semver-major (`vitest` major), deferred to dedicated test tooling upgrade wave.

## Deprecation Noise (punycode)
Investigation logs: `artifacts/punycode_scan.log`
- `punycode@2.3.1` is already used as userland dependency where referenced.
- Runtime `[DEP0040]` warnings originate from transitive runtime behavior (e.g. Bonfida stack / legacy consumers), not direct use of Node core `punycode` API in this sweep.
- No safe same-major dependency bump found that removes warning without broader upgrade risk.

## Lockfile Changes
- Changed: `gateway/package-lock.json` only
- No package manifest or code logic changes.

## Remaining Risks
- High vulnerabilities remain in `gateway` due to transitive Solana/Bonfida dependency chain requiring major upgrade.
- Moderate vulnerabilities remain in test toolchain (`vitest` family) for `core` and `packages/attack-mode` pending dedicated major-upgrade PR.
