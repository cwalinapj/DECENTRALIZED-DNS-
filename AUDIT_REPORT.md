# AUDIT_REPORT

Generated: 2026-02-19T03:04:00Z  
Audited branch: `codex/priority-block-clean`  
Audited base: `origin/main` @ `2f9c8c1`

## Executive Summary

- Baseline smoke checks on a fresh clean worktree: PASS.
- `origin/main` local CI-equivalent baseline remains green.
- Devnet required-program verification: PASS (`6/6` required programs deployed).
- Devnet deployment/funding audit generated and current: `docs/DEVNET_STATUS.md`.
- One-command happy path was missing on main; now added via `scripts/devnet_happy_path.sh` and `npm run mvp:demo:devnet`.
- Existing docs/reporting are partly stale and referenced older commit state.
- Merge log consistency note added here for future operator runs.
- One-command demo now executes end-to-end and surfaces current blockers without hiding them.

## What Exists (Current Main Snapshot)

### Gateway + Resolver
- Recursive multi-upstream ICANN resolution, cache, confidence, upstream audit fields.
- `.dns` routing path remains PKDNS-first in adapter registry.
- `/v1/resolve`, `/v1/route`, `/healthz`, `/v1/attack-mode` are present in gateway server.

### Solana + Devnet
- `solana/scripts/devnet_verify_deployed.ts` exists and validates required MVP programs.
- `solana/scripts/devnet_audit.ts` exists and writes deploy-wallet/program funding posture.
- Devnet scripts are exposed in `solana/package.json`:
  - `devnet:verify`
  - `devnet:audit`

### Services
- `services/tollbooth` supports claim/assign/resolve flow on devnet.
- `services/cf-worker-miner` and onboarding docs/UI are present on main.

### Docs
- `docs/MVP_DOD.md`, `DEVNET_RUNBOOK.md`, and roadmap docs are present.
- README already references a one-command demo, but implementation was missing until this update.

## What Was Missing / Incomplete

1. `npm run mvp:demo:devnet` was documented but not implemented.
2. No single orchestrated command for:
   - devnet verify
   - devnet audit
   - config init attempt
   - route set
   - gateway resolve check
   - optional witness-reward follow-up hook
3. `AUDIT_REPORT.md` content was stale (older head SHA and queue state).

## Baseline Validation (Fresh Clean Worktree)

Commands run:

```bash
npm ci
npm test
npm -C solana i
npm -C solana run devnet:verify
npm -C solana run devnet:audit
```

Result:
- PASS for all above commands.
- Known non-fatal warnings remain (npm deprecation notices, Anchor cfg warnings).

## Devnet Inventory + Funding Snapshot

From `npm -C solana run devnet:audit`:
- Programs audited: `16`
- Total SOL in program accounts: `0.007990080`
- Deploy wallet SOL: `11.945643640`
- Recommended reserve: `5.000000000` (`OK`)

Source of truth:
- `docs/DEVNET_STATUS.md`

## New One-Command Happy Path

Added:
- `scripts/devnet_happy_path.sh`
- root script alias: `npm run mvp:demo:devnet`

Flow:
1. verify deployed programs (`devnet:verify`)
2. audit funding/rent posture (`devnet:audit`)
3. init names config PDA (idempotent/best-effort)
4. start tollbooth + gateway locally
5. set `.dns` route via tollbooth devnet flow
6. resolve ICANN via gateway
7. resolve `.dns` via gateway (best-effort) and tollbooth proof fallback
8. optional witness-reward hook (off by default)
9. prints tx explorer links and `✅ demo complete`

Validation run:

```bash
npm run mvp:demo:devnet
```

Observed:
- script exits `0` and prints `✅ demo complete`.
- ICANN gateway resolve succeeds.
- current blocker remains in tollbooth route flow:
  - `The value of "offset" is out of range. It must be >= 0 and <= 137. Received 138`
  - impact: `.dns` route assignment demo path is not yet successful in current main runtime.

## What’s Next (Minimal Path-to-Market)

1. Fix tollbooth account decode mismatch causing offset error in claim/assign flow (`services/tollbooth/src/solana.ts` and related account decode paths).
2. After fix, rerun `npm run mvp:demo:devnet` and append full command/output snippet to `VERIFIED.md`.
3. Keep `docs/DEVNET_STATUS.md` refreshed after each deploy/upgrade.
4. Keep required program list in `devnet_verify_deployed.ts` aligned with MVP DOD.
5. Normalize/quiet non-fatal anchor warnings in CI logs (optional, low risk).

## Merge Logging Consistency Rule

For all future squash merges, always record:
- PR number
- squash commit SHA on `main`
- final smoke commands run
- pass/fail status for each smoke command

This should be written to both `OPERATOR_LOG.md` and `MERGE_LOG.md`.
