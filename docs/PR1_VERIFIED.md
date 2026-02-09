# PR1 Verification Notes (Docs-First)

Date: 2026-02-09

This PR is documentation-only. No runtime code paths were changed.

What was verified:

- Doc links resolve within the repo after checkout.
- Docs match the intended MVP constraints:
  - centralized tollbooth/gateway allowed in MVP
  - miners can be allowlisted in MVP
  - receipt verification is off-chain in MVP

Where to find runtime verification for the actual program changes:

- PR2 includes a localnet test + devnet deployment evidence: `solana/VERIFIED.md`

