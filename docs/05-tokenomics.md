## Role-Based Access: Index Tolls + Native Stake Requirements

TollDNS separates **usage pricing** from **permissions/accountability**:

- **Index Unit** is always the unit used for **tolls/usage** (DNS queries, gateways, future premium features).
- **Native token staking** is a **role-gate** and accountability mechanism for participants whose usage can create outsized risk or load (business usage, developer integrations, miners).

### User Classes

#### 1) End Users (Consumer / Personal Use)
End users who do **not** use the internet primarily as a means of income (i.e., not operating revenue-generating internet services) are:

- **Required:** pay tolls in **Index Units**
- **Not required:** stake native token (default)

This keeps the DNS accessible and fair for everyday users.

#### 2) Business Users (Revenue-Generating / Hosting / Commercial Use)
Business users (including hosting providers, SaaS operators, ecommerce, services that depend on DNS availability for income) must:

- **Required:** pay tolls in **Index Units**
- **Required:** stake native token (role-based minimums)

Rationale:
- businesses have higher-volume patterns and can externalize risk (abuse, misconfiguration, operational load)
- stake creates accountability and aligns incentives with network health

Business stake can unlock:
- higher rate limits / higher spend ceilings
- priority support / SLA tiers (optional, governance-defined)
- access to premium features (as they launch)

#### 3) Developers (Gateway / Adapter / Integration Builders)
Developers who publish gateway adapters or backend integrations must:

- **Required:** pay any applicable listing/integration fees in native token (if governance requires)
- **Required:** stake native token (developer tier)
- **Also pay:** usage tolls in **Index Units** for traffic their gateway handles (as applicable by policy)

Developers have more permissions than end users, such as:
- submitting new adapters/backends for DAO approval
- receiving revenue share payouts when traffic routes through their gateway
- participating in higher-privilege governance processes (optional)

#### 4) Miners / Operators (Edges, Gateways, Caches, Anycast, Scrubbing)
All miners/operators must:

- **Required:** stake native token (operator tier)
- **Earn:** payouts in native token based on proof-of-serving and performance
- **Also pay (where applicable):** Index Unit tolls for network resources they consume (optional; governance-defined)

Stake is used to:
- reduce Sybil attacks (cheap identity spam)
- enforce operator accountability
- support governance enforcement (delisting, penalties, future slashing if adopted)

---

## Staking Rules (No Instant-Exit Abuse)

To prevent “stake → misbehave → withdraw immediately” abuse, all required staking must follow:

- **Minimum lock / freeze period** (e.g., 30 days)
- **Cooling-off exit delay** (withdrawals only claimable after a delay window)
- Optional later: **slashable stake** for provable violations (only where objective proofs exist)

Staking is not the same as spend escrow:
- spend escrow is for user convenience (Index Unit usage)
- stake is for permissions/accountability (native token, time-locked)

---

## Permissions & Feature Access

TollDNS can progressively roll out features similar to a cloud edge provider (e.g., “nameserver usage for clients”, caching layers, gateway acceleration, additional routing/security features).

**Rule:** As these Cloudflare-like features launch, they are priced in **Index Units** (usage toll currency), not in the native token.

Native token stake may still be required to access certain higher-risk or higher-impact modes (e.g., business tiers, developer publishing permissions, operator roles), but *pricing for usage remains Index-based*.

---

## Summary Table

| Role | Pays Usage Tolls | Stakes Native Token | Notes |
|------|------------------|---------------------|------|
| End User | Index Units | No (default) | Consumer use |
| Business User | Index Units | Yes | Higher limits / accountability |
| Developer | Index Units (for usage) | Yes | Extra permissions + revenue share eligibility |
| Miner/Operator | N/A (earns) / optional Index usage | Yes | Proof-of-serving payouts in native |
