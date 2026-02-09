# End-State: Permissionless Watchdogs + Dispute-Backed Policy

This doc contains: **End-State 🔮** (not fully implemented).

## Goals

- censorship resistance: no single watcher can force quarantine/OK
- integrity: signatures + proofs make cheating expensive and punishable
- decentralization: anyone can run a watchdog, but influence is earned and slashable

## Roadmap (Watchdogs)

1) Signed attestations accepted on-chain
- `submit_attestation_signed(payload_bytes, sig)` verifies ed25519 on-chain
- payload format is fixed and versioned

2) Permissionless watchdog set
- watchdogs register by staking and meeting performance criteria
- reputations are computed from historical correctness and availability

3) Dispute windows + slashing
- incorrect attestations can be challenged with evidence
- slashing/jailing for provably false or malicious behavior

4) Stake-weighted / reputation-weighted thresholds
- policy transitions require quorum by stake-weight or reputation-weight (not allowlists)

## Policy Outputs (Still Useful)

Policy continues to emit compact routing hints:
- OK / WARN / QUARANTINE
- TTL caps and penalty signals

These signals can become inputs to:
- miner/operator scoring
- gateway routing preferences
- automated fallback policies

See:
- `PROTOCOL_WATCHDOG_ATTESTATION.md`

