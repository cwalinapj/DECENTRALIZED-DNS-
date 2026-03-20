# Audit Preparation (Beyond Devnet)

Use this checklist before requesting a formal external audit.

## Required gates

- `npm run prod:baseline:check`
- `npm run prod:release:verify`
- `npm run prod:invariants:check`
- `npm run prod:audit:preflight`

## Program invariants to lock

1. Ownership invariants
- Route updates require valid owner/passport relationship.
- Unauthorized wallet cannot mutate another wallet's route state.

2. Economic invariants
- Reward mint/transfer paths are authority-constrained.
- Staking state transitions preserve token accounting consistency.

3. PDA/data invariants
- PDA derivation seeds are deterministic and collision-safe.
- Config PDAs are initialized once or explicitly versioned.

4. Failure-mode invariants
- No silent local-fallback in strict production paths.
- Every critical mutation emits an auditable transaction reference.

## Evidence pack for auditors

- Current `solana/Anchor.toml` with active program IDs.
- Signed release manifests in `artifacts/releases/`.
- Latest strict devnet proof (`docs/PROOF.md` + artifact logs).
- Threat model, attack-mode policy, and incident runbook references.

## Gaps to close before mainnet consideration

- Expand invariant tests from static checks to instruction-level property tests.
- Freeze upgrade authority policy (multisig/timelock) and document rollback process.
- Add independent review for token utility and reward abuse surfaces.
