# Client (Phone / Desktop / Router)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

The client provides:

- local DNS stub (system DNS interception)
- DoH/DoT forwarding to TollDNS ingress/resolvers
- wallet integration for **Index Unit** spend escrow (no per-query prompts)
- local spend rules and safety controls

Key economic rule:

- Users spend **Index Units** for usage/tolls.
- Native token staking is required for business/dev/operator roles (not typical end users).

Client responsibilities:

- maintain escrow balance (Index Units)
- sign vouchers authorizing micro-spends
- enforce local policy (spend caps, allowlists, emergency stop)
- optionally manage web3 namespace preferences and caching

Related:

- Tokenomics: `docs/05-tokenomics.md`
- Architecture: `docs/01-architecture-overview.md`
