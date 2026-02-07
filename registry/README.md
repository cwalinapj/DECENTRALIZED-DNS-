# Registry Contracts (Backends, Adapters, Operators, Fallback Sets)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

This folder specifies the on-chain registries that define:
- which backends are enabled,
- which adapters implement them,
- which operators/miners are eligible to receive traffic,
- and which fallback sets are permitted under policy.

Registries are governance-controlled and referenced by the routing engine and policy state machine.

Related:
- Backends: `docs/02-resolution-backends.md`
- Backend interface: `specs/backend-interface.md`
- Routing: `docs/07-routing-engine.md`

---

## Contracts in this Module

### 1) AdapterRegistry
Tracks adapter listings (integration modules) and their immutable references:
- adapter id + version
- supported namespaces/capabilities
- conformance profile ids
- content-hash pointer to adapter spec/build
- optional listing fee / required developer stake tier

**Purpose**
- standardize integrations
- allow DAO to approve/deny adapters
- enable watchdog conformance checks

---

### 2) BackendRegistry
Tracks enabled backends and maps them to:
- adapter id/version
- policy id (watchdog thresholds)
- verifier set id
- fallback set id
- immutable config pointer(s)

**Purpose**
- make routing and fallback auditable and deterministic

---

### 3) OperatorRegistry
Tracks miner/operator identities and capabilities:
- operator id
- roles (EDGE_INGRESS, GATEWAY, CACHE, ANYCAST, SCRUBBING)
- supported namespaces
- coarse region bucket(s)
- optional ASN/provider metadata (coarse)
- stake status reference (must be staked to be active)
- signing keys for receipts

**Purpose**
- route traffic to eligible operators
- pay rewards only to registered staked operators
- enforce diversity controls (caps)

---

### 4) FallbackSetRegistry
Defines allowed fallback sets for a backend:
- list of fallback backend ids (decentralized and/or centralized references)
- rules for when they may be used (state-based)
- optional ordering/weights

**Purpose**
- make fallback behavior explicit and governance-controlled

---

## Required Invariants

- Only DAO (or timelocked governance) can add/remove/modify enabled backends and adapters.
- Operator activation MUST require native token stake status (per `docs/05-tokenomics.md`).
- Backend records MUST reference immutable config/policy hashes (or NFT-like pointers).
- Fallback sets MUST be explicit and limited (prevent silent “always fallback”).

---

## Suggested Data Fields

### Adapter Listing
- `adapter_id`, `version`
- `capabilities`, `namespaces`, `qtypes`
- `conformance_profile_ids`
- `spec_hash` / `build_hash`
- `developer_stake_tier_required` (optional)
- `listing_fee_native` (optional)

### Backend Entry
- `backend_id`
- `adapter_id@version`
- `policy_id`
- `verifier_set_id`
- `fallback_set_id`
- `config_hash`
- `enabled` flag

### Operator Entry
- `operator_id`
- `roles`
- `regions`
- `namespaces`
- `receipt_pubkey`
- `stake_status_ref`
- `enabled` flag

Events (examples):
- `AdapterListed(adapter_id, version, hash)`
- `BackendEnabled(backend_id)`
- `BackendDisabled(backend_id)`
- `OperatorRegistered(operator_id)`
- `OperatorEnabled(operator_id)`
- `OperatorDisabled(operator_id)`
- `FallbackSetUpdated(set_id)`
