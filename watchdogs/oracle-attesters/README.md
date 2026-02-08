# Oracle Attesters (Index Unit Pricing Inputs)

Oracle attesters provide signed inputs used for:

- Index Unit pricing model updates (as governance defines)
- sanity bounds and "rate-of-change" guards
- emergency fallback pricing signals (optional)

Important:

- Oracle attesters do not directly change policy state; they provide signed observations.
- Governance and timelocks determine how pricing updates are applied.

Related:

- Tokenomics: `docs/05-tokenomics.md`
