# EVM Commitments Specification

**Status:** Draft  
**Scope:** Ethereum / EVM chains (Solidity-compatible)

This document specifies how DECENTRALIZED-DNS commitments are stored and updated on EVM chains.

---

## 1. Commitment Model

For each `name_id` (bytes32), store:

- `seq` (uint64)
- `exp` (uint64) unix seconds
- `routeset_hash` (bytes32)

Optional delegation:
- `g_seq` (uint64)
- `g_exp` (uint64)
- `gateway_routes_hash` (bytes32)

---

## 2. Storage Layout

### 2.1 Minimal commitment (recommended)
```solidity
struct Commitment {
    uint64 seq;
    uint64 exp;
    bytes32 routesetHash;
}
mapping(bytes32 => Commitment) public commitments;

2.2 Optional delegation (Seperate Mapping)

Keeping delegation separate avoids paying storage for names that don’t use it.

struct Delegation {
    uint64 gSeq;
    uint64 gExp;
    bytes32 gatewayRoutesHash;
}
mapping(bytes32 => Delegation) public delegations;
