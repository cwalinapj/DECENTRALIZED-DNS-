# Miner / Operator (Edge, Gateway, Cache, Anycast, Scrubbing)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

Miners (operators) provide distributed infrastructure:
- EDGE-INGRESS (admission + caching)
- GATEWAY (web3/content retrieval)
- CACHE (RRsets/routes/content)
- optional ANYCAST ingress
- optional SCRUBBING capacity

Economic rule:
- Miners must **stake native token** (time-locked, exit delay).
- Miners are paid in **native token** based on proof-of-serving and performance.

Operator responsibilities:
- serve requests under routing policy
- produce signed receipts (batch receipts preferred)
- maintain uptime/performance SLOs
- respect policy enforcement (delisting, disabled backends, compliance rules)

Related:
- Tokenomics: `docs/05-tokenomics.md`
- Resilience tokenomics: `docs/06-resilience-tokenomics.md`
- Receipt format: `specs/receipt-format.md`
