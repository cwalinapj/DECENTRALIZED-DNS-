# System Flow Diagram

```mermaid
flowchart LR
  U[User Device] -->|DNS query| S[Local Stub + Wallet]
  S -->|DoH/DoT + Signed Voucher| R[Paid Recursive Resolver]

  R -->|Web2 recursion or forward| UP[Upstream DNS\n(Cloudflare/Google/etc.)]
  UP --> R

  R -->|Gateway/cache request| M[Miner Node\n(Gateway/Cache/Edge)]
  M -->|Response + Service Receipt| R

  R -->|DNS response| S
  S --> U

  S -->|Escrow deposit| L2[L2 Chain\nEscrow + Registry + Rewards]
  R -->|Batch settlement\n(vouchers + payouts)| L2
  L2 -->|Payouts| M
  L2 -->|Fee| R
