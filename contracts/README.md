# Contracts (L2 Control Plane)

Repo home: <https://github.com/cwalinapj/DECENTRALIZED-DNS->

This README describes the **`contracts/`** directory: the on-chain (L2) control plane for TollDNS.

TollDNS keeps the blockchain **out of the hot path**. Contracts govern:

- roles & permissions (who can do what),
- staking requirements (miners/devs/business users),
- spend escrow for **Index Units** (tolls),
- batch settlement and rewards (native token payouts),
- backend registry and adapter listings,
- watchdog health attestation ingestion,
- and the immutable **policy state machine** that drives automatic fallback.

**Key principle:** usage is priced and paid in **Index Units**. The **native token** is used for governance, staking, rewards, reserves, grants, burns, and integration fees.

See:

- Tokenomics: `docs/05-tokenomics.md`
- Watchdogs & fallback: `docs/03-watchdogs-and-fallback.md`
- Policy state machine: `specs/policy-state-machine.md`
- Health report format: `specs/health-report-format.md`
- Receipt format: `specs/receipt-format.md`

---

## Contract Modules (High-Level)

### A) Tokens

- `NativeToken`: utility/governance token (NOT the toll)
- `IndexUnit`: stable usage unit used for tolls and “Cloudflare-like” features

---

### B) Spend Escrow (Index Units)

- `SpendEscrow`: holds Index Units for users (no per-query prompts)
- `VoucherVerifier`: verifies signed vouchers and supports batch settlement

---

### C) Staking & Roles (Native Token)

- `StakePool`: time-locked staking with exit delay (no instant withdrawal)
- `RoleRegistry`: maps addresses to roles and tier permissions
- `BusinessAccess`: business users must stake + also pay Index tolls
- `DeveloperAccess`: developers must stake + can submit adapters/gateways
- `OperatorAccess`: miners/operators must stake to participate and earn

---

### D) Registries (Backends, Adapters, Operators)

- `BackendRegistry`: enabled backends and immutable metadata pointers (hashes / NFT-like pointers)
- `AdapterRegistry`: adapter listings + conformance profile references
- `OperatorRegistry`: miners/operators, capabilities, coarse region/ASN metadata, stake status

---

### E) Watchdogs & Policy (Automatic Fallback)

- `VerifierSetRegistry`: authorized verifiers per epoch
- `HealthReportIngestor`: validates/verifies health reports
- `PolicyStateMachine`: updates backend states and routing policy (circuit breaker)
- `RoutingPolicyRegistry`: current routing weights, flags, fallback sets, policy version

---

### F) Settlement & Rewards (Native Token)

- `ReceiptIngestor`: validates proof-of-serving receipts (or receipt roots)
- `RewardDistributor`: pays rewards based on receipts, multipliers, and policy
- `Treasury`: DAO-owned reserves (grants, subsidies, incident response)
- `BurnManager`: burns native token as a function of Index Unit purchases (DAO-parameterized)

---

### G) Governance (DAO)

- `Governor`: proposal + voting mechanisms
- `Timelock`: delayed execution for sensitive actions
- `ParameterStore`: versioned policy parameters referenced by registries/state machine

---

## Suggested Directory Layout

```txt
contracts/
  README.md

  tokens/
    NativeToken.sol
    IndexUnit.sol

  escrow/
    SpendEscrow.sol
    VoucherVerifier.sol

  staking/
    StakePool.sol
    RoleRegistry.sol
    BusinessAccess.sol
    DeveloperAccess.sol
    OperatorAccess.sol

  registry/
    BackendRegistry.sol
    AdapterRegistry.sol
    OperatorRegistry.sol
    FallbackSetRegistry.sol

  watchdog/
    VerifierSetRegistry.sol
    HealthReportIngestor.sol
    PolicyStateMachine.sol
    RoutingPolicyRegistry.sol

  settlement/
    ReceiptIngestor.sol
    RewardDistributor.sol

  treasury/
    Treasury.sol
    BurnManager.sol
    Grants.sol
    Subsidies.sol

  governance/
    Governor.sol
    Timelock.sol
    ParameterStore.sol

  interfaces/
    ISpendEscrow.sol
    IStakePool.sol
    IBackendRegistry.sol
    IPolicyStateMachine.sol
    IRewardDistributor.sol

  libs/
    CanonicalJSON.sol
    Merkle.sol
    Signature.sol
    Buckets.sol
