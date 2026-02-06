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

## Resilience Architecture (Edges + Anycast + Scrubbing)

```mermaid
flowchart TB
  subgraph Clients
    U1[User Devices\nPhone/Desktop/Router]
  end

  subgraph EdgeLayer[Edge Layer (Distributed Miners)]
    E1[EDGE-INGRESS Miner\nDoH/DoT + Toll Booth Gate]
    E2[EDGE-INGRESS Miner\nDoH/DoT + Toll Booth Gate]
    EA[Anycast VIP\n(ANYCAST-INGRESS)]
  end

  subgraph Scrub[Scrubbing Layer]
    SB[SCRUBBING-BACKEND\nDDoS Filtering Capacity]
  end

  subgraph Core[Core Resolver Layer]
    R1[CORE-RESOLVER\nRecursion + Routing]
    R2[CORE-RESOLVER\nRecursion + Routing]
  end

  subgraph Upstream[Optional Upstream (Bootstrapping / Fallback)]
    CF[Upstream DNS\n(Cloudflare/Google/etc.)]
  end

  subgraph Chain[L2 Control Plane]
    L2[L2 Chain\nEscrow + Registry + Rewards]
  end

  %% Client to Anycast/Edges
  U1 -->|DoH/DoT| EA
  EA --> E1
  EA --> E2

  %% Toll booth gating at edge
  E1 -->|Admit paid/session| R1
  E2 -->|Admit paid/session| R2

  %% Scrubbing protects ingress during attacks
  U1 -->|Attack traffic hits VIP/Ingress| SB
  SB -->|Clean traffic| EA

  %% Core resolver fallback path
  R1 -->|Web2 recursion or forward| CF
  CF --> R1

  %% Control plane payments
  U1 -->|Escrow deposit| L2
  R1 -->|Batch settlement\n(vouchers + payouts)| L2
  R2 -->|Batch settlement\n(vouchers + payouts)| L2
  L2 -->|Payouts| E1
  L2 -->|Payouts| E2
  L2 -->|Payouts| SB
