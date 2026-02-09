# Threat Model (MVP + End State)

This doc contains: **MVP ✅** and **End-State 🔮**.

## System Map (Trust Boundaries)

**Wallet / Client**
- local cache (routes, proofs, receipts)
- signs receipts (end state), pays toll (MVP: centralized toll surface may exist)

**Gateway / Resolver (MVP centralized, untrusted for correctness)**
- resolves names across adapters (PKDNS/ENS/SNS/IPFS)
- returns a route answer + proof data for client verification

**Tollbooth (MVP centralized, optional)**
- sells/authorizes route acquisition (toll events)
- may be an allowlisted signer (escrow voucher settlement)

**Witness Gateway (MVP centralized, optional)**
- emits witness receipts (privacy-safe)
- batches receipts for miners

**Miner / Witness Aggregator (MVP allowlisted)**
- verifies receipts off-chain, aggregates, submits to chain
- publishes evidence (roots, batches) for audit

**On-chain programs (source of truth for canonical state)**
- `ddns_registry`: canonical routes (`["canonical", name_hash]`)
- `ddns_quorum`: aggregate acceptance + finalization logic (MVP: allowlisted submitters)
- `ddns_stake` / `ddns_stake_gov`: stake weights + snapshots (MVP: allowlisted snapshot submitters)
- `ddns_watchdog_policy`: policy hints (OK/WARN/QUARANTINE) from watchdogs (MVP: allowlists + digest path)

**External dependencies**
- Solana RPC endpoints
- upstream DoH resolvers (ICANN baseline)
- IPFS gateways

## Threat Categories (STRIDE + Protocol)

For each threat: Description, attacker capability, impact, detection, mitigations, residual risk.

### 1) Censorship / Filtering
**Description**: ISP or state actor blocks access to gateway, Solana RPC, or IPFS gateways.
**Capability**: network-level filtering, DNS poisoning, TLS interception.
**Impact**: users cannot fetch canonical updates; service availability degraded.
**Detection signals**
- RPC request failure rate spike
- inconsistent slot heights across RPC URLs
- gateway timeouts/spikes
- IPFS gateway failures
**Mitigations**
- MVP: multi-RPC reads; cache-first; “attack mode” freezes writes; configurable fallback gateways.
- End-state: multi-gateway client routing; local DoH endpoint; IPFS mirrors; censorship evidence via watchdogs.
**Residual risk**: full network partition still forces isolated operation (serve cache only).

### 2) Route Poisoning
**Description**: attacker gets client to cache a malicious dest (phishing/malware).
**Capability**: malicious gateway response, local malware, compromised miner aggregate.
**Impact**: users routed to attacker content.
**Detection signals**
- mismatch between cached route and on-chain canonical dest_hash
- watchdog mismatch/censorship attestations
- sudden canonical flip for a name_hash
**Mitigations**
- MVP: clients verify on-chain canonical reads (multi-RPC in suspicious modes); TTL clamp; quarantine policy.
- End-state: stake-weighted receipts, dispute windows + slashing, stronger proofs.
**Residual risk**: if user is eclipsed (only attacker-controlled sources), poisoning can persist until reconnected.

### 3) Sybil Receipts
**Description**: attacker submits many fake receipts to sway aggregates.
**Capability**: create many wallets; automate submissions.
**Impact**: quorum decisions skewed, reward exploitation.
**Detection signals**
- invalid signature ratio, duplicate ratio, “wallet entropy” anomalies
- no-stake receipts dominating volume
**Mitigations**
- MVP: allowlisted miners; ignore no-stake receipts for stake_weight; rate limits; require passport/stake in attack mode.
- End-state: stake-weighted acceptance with Merkle proofs, on-chain verification, slashing for invalid aggregates.
**Residual risk**: sophisticated Sybil with stake is more costly but still possible; addressed via economics and slashing.

### 4) Miner Capture / Cartel
**Description**: few miners dominate aggregates and censor updates.
**Capability**: operational scale, bribery, stake concentration.
**Impact**: censorship, biased routing, reward capture.
**Detection signals**
- dominance metrics (share of aggregates, stake concentration)
- churn in verifier set; correlated behavior
**Mitigations**
- MVP: explicit allowlist and transparency (auditable submissions).
- End-state: anti-centralization reward curves, watchdog penalties, permissionless entry + slashing.
**Residual risk**: any stake-weighted system can be captured if stake centralizes.

### 5) Eclipse Attack
**Description**: victim sees only attacker-controlled RPC/gateway.
**Capability**: network control, malicious DNS/hosts config, compromised device.
**Impact**: victim accepts false canonical state or stale state.
**Detection signals**
- multi-RPC disagreement
- unexpected slot regressions
**Mitigations**
- MVP: multi-RPC agreement threshold; “ISOLATED” attack mode freezes writes.
- End-state: light client proofs; multi-gateway + gossip; pinned checkpoints.
**Residual risk**: strong attacker can still isolate a victim; client should fail closed for writes.

### 6) Replay
**Description**: old receipts/aggregates reused to revert canonical route.
**Capability**: record old proofs, resubmit.
**Impact**: rollback to insecure destination.
**Detection signals**
- stale epoch/slot in aggregate
- canonical version decreases (should not happen)
**Mitigations**
- MVP: epoch windows; freshness checks; version monotonicity.
- End-state: on-chain proof validation with dispute windows.
**Residual risk**: if freshness checks are too lax, replay becomes easier.

### 7) Front-running / Name Squatting
**Description**: attacker claims desired `.dns` first.
**Capability**: bot buys names quickly.
**Impact**: name scarcity abuse, extortion.
**Mitigations**
- MVP: deterministic name uniqueness on-chain (NameRecord PDA).
- End-state: auctions/commit-reveal, limits per wallet, economic penalties.
**Residual risk**: any first-come namespace can be squatted without pricing/auction mechanisms.

### 8) Spam / DoS
**Description**: receipt flooding to miners/gateway; toll write spam.
**Capability**: botnet, request amplification.
**Impact**: service outage, increased costs.
**Detection signals**
- request rate spikes; invalid receipt ratio spikes
- per-wallet or per-IP hot spots
**Mitigations**
- MVP: rate limits; attack mode increases auth requirements; writes disabled under attack.
- End-state: proof-of-work/proof-of-stake admission, decentralized ingress.
**Residual risk**: centralized gateways remain DoS targets in MVP.

### 9) Key Compromise (Wallet / Miner / Gateway)
**Description**: stolen keys issue receipts, change routes, or submit bad aggregates.
**Capability**: malware, phishing.
**Impact**: incorrect routing, reward theft, censorship.
**Mitigations**
- MVP: minimize key scope; rotate allowlisted keys; monitoring.
- End-state: slashing for provably false behavior; hardware wallets; multi-sig for governance.
**Residual risk**: user key theft remains a general risk; clients should emphasize safe recovery workflows.

### 10) Economic Attacks
**Description**: stake in/out gaming, bribery to finalize.
**Impact**: unstable security, reward capture.
**Mitigations**
- MVP: lockups, cooldowns (stake_gov), explicit allowlists.
- End-state: evidence-based slashing + governance parameters.
**Residual risk**: bribery is hard to eliminate; reduce with transparency and disputeability.

### 11) Data Availability (IPFS)
**Description**: CID content disappears or gateways are blocked.
**Impact**: route points to unavailable content.
**Detection signals**
- gateway HEAD failures; watchdog integrity checks
**Mitigations**
- MVP: multi-gateway attempts; cache last-known-good; TTL clamp.
- End-state: IPFS pinning markets, on-chain snapshot pointers, sampling verification.
**Residual risk**: content availability is not guaranteed without incentives.

### 12) Privacy Attacks
**Description**: link wallet identity to browsing behavior.
**Capability**: gateway logs, correlation attacks, timing.
**Mitigations**
- MVP: avoid user identifiers in witness receipts; time-bucket observations; minimize logs; optional Tor/relay later.
- End-state: stronger privacy-preserving routing; encrypted receipt batching; opt-in beacons only.
**Residual risk**: any centralized gateway can correlate traffic; minimize and decentralize over time.

