# Resolver (Paid Recursive DNS + Router + Settlement Coordinator)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

Resolvers are the core paid recursive DNS services (DoH/DoT) that:

- validate vouchers (cheap)
- perform recursion (native and/or upstream quorum)
- route to gateways/caches/operators
- record proof-of-serving receipts
- batch-settle Index Unit spends and distribute native token rewards

Resolvers must obey:

- routing policy states from the policy registry (HEALTHY/DEGRADED/DISABLED/RECOVERING)
- diversity caps (ASN/operator caps)
- incident mode flags (Attack Mode, cache-first)

Related:

- Routing engine: `docs/07-routing-engine.md`
- Policy: `docs/03-watchdogs-and-fallback.md`
- Receipt format: `specs/receipt-format.md`
