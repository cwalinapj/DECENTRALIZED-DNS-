# Mass Adoption Roadmap

This roadmap is Web2-first and Web3-backed. The objective is immediate utility for everyday domain users, with optional on-chain proofs and incentives for operators and developers.

## Pillars

1. Faster ICANN resolution
- Multi-upstream recursive quorum + local TTL cache.
- Confidence + upstream audit metadata for safer fallback behavior.

2. Earn by using our nameservers
- Domain-owner reward split from toll events (policy-governed).
- Miner/verifier rewards for useful, validated work.

3. Free hosting + templates + reduced registrar pricing
- Hosting/templates are an adoption wedge.
- Reduced registrar pricing and rebates are tied to keeping NS on DDNS (policy-governed, not guaranteed).

4. AI Guardrail Workers
- Workers produce signed receipts and recommendations for checks/backups/proofs.
- Bond + challenge/slash model is the anti-abuse control plane.
- MVP scope: recommendations and attestations only.
- No silent production mutations; actions require explicit user approval or policy state-machine authorization.

5. Developer API + SDK
- Consistent JSON answers with confidence and proof metadata.
- Audit-friendly response model and monetization hooks for projects using DDNS nameservers.

6. Premium naming (Bonfida-like model)
- Free subdomains for identity onboarding.
- Paid forever premium primaries.
- Subdomains are non-transferable by default; premium owners can opt into controlled transfer models.

7. Future bonded hosting tier (jive-coder wedge)
- Load balancing + auto-k8s deployment as a future bonded tier.
- Economic gating: escrow/bond scales with resource use and abuse risk.

## MVP vs Roadmap Clarity

- MVP now: recursive quorum/caching, `.dns` canonical pathing, policy hints, reward primitives, docs+scripts.
- Roadmap: registrar discount loops, full hosting product, auto-k8s, broader worker markets, stronger permissionless proofs.
