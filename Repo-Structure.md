README.md
PROSPECTUS.md
/docs
  00-vision.md
  01-architecture-overview.md
  02-resolution-backends.md
  03-watchdogs-and-fallback.md
  04-functional-equivalence-proofs.md
  05-tokenomics.md
  06-resilience-tokenomics.md
  07-routing-engine.md
  08-threat-model.md
  09-roadmap.md
  diagrams.md
/specs
  backend-interface.md
  health-report-format.md
  receipt-format.md
  policy-state-machine.md
/contracts
  README.md
  escrow/
  registry/
  policy/
  settlement/
  proofs/
/adaptors
  README.md
  dns-icann/
  dns-upstream-quorum/
  ipfs/
  filecoin/
  arweave/
  ens/
  unstoppable/
  solana-sns-bonfida/
  handshake/
  pkdns-pkarr/
  tor-odoH/
/watchdogs
  README.md
  verifier-node/
  regional-probers/
  oracle-attesters/
  incident-detector/
/client
  README.md
/resolver
  README.md
/miner
  README.md

  Why this layout
 • /docs = narrative “prospectus” (what + why)
 • /specs = exact formats + state machines (how)
 • /adaptors = “we integrate existing networks” in a clean plug-in way
 • /watchdogs = the off-chain measurement layer that feeds your immutable on-chain policy
 • /contracts = your L2 logic (escrow, registry, policy, settlement, proofs)

## Implementation file checklist (proposed)

The following files/modules are needed to implement the behavior described in each README.

### /docs

- `00-vision.md` through `09-roadmap.md` (existing narrative scope)
- `diagrams.md` (system flows and Mermaid diagrams)

### /specs

- `backend-interface.md` (adaptor interface contract)
- `health-report-format.md` (watchdog report schema)
- `receipt-format.md` (proof-of-serving format)
- `policy-state-machine.md` (state transition rules)

### /adaptors/{adaptor-name}/ (e.g., dns-icann, dns-upstream-quorum)

- `README.md` (scope/capabilities, already present)
- `implementation/` (namespace resolution + mapping logic)
- `conformance/` (profile definitions + challenge sets)
- `config/example` (RPC endpoints, gateway lists, policy knobs)
- `tests/` (conformance + fallback behavior)

### /client

- `src/dns-stub` (system DNS interception + local cache)
- `src/doh-dot-client` (DoH/DoT transport + retries)
- `src/wallet/escrow` (Index Unit balance + deposit/withdraw)
- `src/voucher/signer` (voucher issuance + anti-replay)
- `src/policy/spend-limits` (local caps + emergency stop)
- `config/defaults` (spend limits, resolver endpoints)
- `tests/` (voucher, policy, and transport coverage)

### /resolver

- `src/ingress/doh-dot-server` (paid recursive DNS endpoint)
- `src/voucher/validator` (cheap verification + batching)
- `src/recursion/native` (ICANN recursion + DNSSEC hooks)
- `src/recursion/upstream-quorum` (forwarding + quorum logic)
- `src/routing/engine` (policy + diversity caps)
- `src/receipts/collector` (proof-of-serving receipts)
- `src/settlement/batcher` (Index Unit settlement windows)
- `config/routing` (policy cache, fallback sets)
- `tests/` (routing + settlement invariants)

### /miner

- `docker-compose.yml` (phase-1 operator stack)
- `src/ingress/proxy` (edge admission + caching)
- `src/cache/rrsets` (validated response caching)
- `src/gateway/{backend}` (IPFS/Filecoin/Arweave handlers)
- `src/operator/agent` (registration + key management)
- `src/receipts/signer` (batch receipt signing)
- `config/roles` (edge/gateway/cache role profiles)
- `tests/` (receipt + cache behavior)

### /contracts

- `tokens/NativeToken.sol`, `tokens/IndexUnit.sol`
- `escrow/SpendEscrow.sol`, `escrow/VoucherVerifier.sol`
- `staking/StakePool.sol`, `staking/RoleRegistry.sol`
- `staking/BusinessAccess.sol`, `staking/DeveloperAccess.sol`, `staking/OperatorAccess.sol`
- `registry/{Adaptor,Backend,Operator,FallbackSet}Registry.sol`
- `watchdog/{VerifierSetRegistry,HealthReportIngestor,PolicyStateMachine,RoutingPolicyRegistry}.sol`
- `settlement/{SettlementCoordinator,ReceiptIngestor,RewardDistributor}.sol`
- `treasury/{Treasury,BurnManager,Grants,Subsidies}.sol`
- `governance/{Governor,Timelock,ParameterStore}.sol`
- `interfaces/` + `libs/` (shared contracts)
- `tests/` (invariants + access controls)

### /contracts/proofs

- `ConformanceRegistry.sol`
- `ConformanceAttestationIngestor.sol`
- `ReceiptAuditHook.sol`
- `tests/` (attestation + audit flows)

### /escrow

- `README.md` (module spec, already present)
- `SpendEscrow.sol` (Index Unit escrow)
- `VoucherVerifier.sol` (voucher validation + replay guards)
- `tests/` (balance + replay invariants)

### /policy

- `README.md` (module spec, already present)
- `VerifierSetRegistry.sol`
- `HealthReportIngestor.sol`
- `PolicyStateMachine.sol`
- `RoutingPolicyRegistry.sol`
- `tests/` (state transitions + quorum rules)

### /registry

- `README.md` (module spec, already present)
- `AdaptorRegistry.sol`
- `BackendRegistry.sol`
- `OperatorRegistry.sol`
- `FallbackSetRegistry.sol`
- `tests/` (permissions + immutability checks)

### /settlement

- `README.md` (module spec, already present)
- `SettlementCoordinator.sol`
- `ReceiptIngestor.sol`
- `RewardDistributor.sol`
- `tests/` (receipt validation + caps)

### /watchdogs/verifier-node

- `src/probe-runner` (health probes)
- `src/conformance-runner` (challenge execution)
- `src/health-report-signer` (report generation)
- `config/targets` (backend targets + schedules)
- `tests/` (report + signature correctness)

### /watchdogs/regional-probers

- `src/prober-agent` (multi-vantage probes)
- `src/aggregator` (bucketed output)
- `config/regions` (geography/ASN targeting)
- `tests/` (probe sampling + aggregation)

### /watchdogs/oracle-attesters

- `src/oracle-client` (pricing signal fetch)
- `src/signing` (attestation signing)
- `config/sources` (oracle endpoints + thresholds)
- `tests/` (rate-of-change guards)

### /watchdogs/incident-detector

- `src/signal-aggregator` (multi-backend incident scoring)
- `src/attack-mode-recommender` (policy signal outputs)
- `config/thresholds` (incident triggers)
- `tests/` (attack-mode trigger logic)
