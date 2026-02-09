# DDNS Stake Governance (ddns_stake_gov)

This doc covers: **MVP ✅** (allowlisted slashers + snapshot submitters) and **End-State 🔮** (evidence-based slashing + permissionless participation).

## Purpose

`ddns_stake_gov` is a dedicated governance stake pool program. It is the canonical source of:

- stake positions per wallet
- lockups, exit cooldowns (two-step withdrawals)
- verifier delegation
- verifier jailing (temporary removal after slashing)
- slashing records (MVP: allowlisted authorities)
- epoch stake snapshots (Merkle root) for miners + quorum logic

## Objects (On-Chain)

### Config (PDA)
Seed: `["stake_gov_config"]`

Stores:
- stake mint + vault (all stake tokens live in the vault)
- epoch length (slots -> epoch_id)
- min stake, lock tier table (lock_epochs -> multiplier_bps)
- allowlists (MVP):
  - `slash_authorities[]`
  - `snapshot_submitters[]`
- parameters for dispute window, exit cooldown, jailing, slash caps

### Stake Position (PDA per wallet)
Seed: `["stake", staker_pubkey]`

Tracks:
- staked amount
- locked amount + lock_end_epoch + lock multiplier (chosen at lock-time for MVP)
- pending withdrawal request + exit_requested_epoch
- optional delegation target (verifier pubkey)
- whether delegation is slashable (MVP: stored but delegated-stake slashing is not implemented)

### Verifier Registry (PDA)
Seed: `["verifier_registry"]`

Authority registers verifiers in MVP:
- verifier pubkey
- commission bps
- active flag
- `jailed_until_epoch`

### Stake Snapshot (PDA per epoch)
Seed: `["stake_snapshot", epoch_id_le]`

Stores:
- `root`: Merkle root of (wallet -> weight) entries
- `total_weight`
- created slot + submitter

MVP: snapshot submission is allowlisted; on-chain does not verify the root contents.

### Slash Record (PDA)
Seed: `["slash", epoch_id_le, offender_pubkey, reason_hash]`

Stores:
- offender
- bps + amount_slashed
- reason_hash + evidence_ref (opaque 32-byte refs)
- applied slot + slasher

## Epochs

Epoch id is derived deterministically:

```
epoch_id = current_slot / config.epoch_len_slots
```

## Locks and Exits (MVP behavior)

### Lock
- `lock(amount, lock_epochs)` moves `amount` from liquid to locked accounting
- lock multiplier is selected from the tier table at lock time (MVP simplification)
- locked stake cannot be exited until the lock expires (`unlock_expired`)

### Exit
Two-step:
1. `request_exit(amount)` starts cooldown and marks `pending_withdraw_amount`
2. `finalize_withdraw()` transfers from vault -> user ATA once cooldown has elapsed

## Slashing + Jailing (MVP trust model)

MVP assumptions:
- **only allowlisted `slash_authorities` can slash**
- on-chain does **not** validate evidence (miners / governance do this off-chain)
- slashing applies **only to the offender wallet’s own StakePosition** (no delegated-stake slashing in MVP)

Jailing:
- if the offender is a registered verifier, it is jailed for `jail_epochs_after_slash`
- clients should treat jailed verifiers as ineligible delegation targets until the jail expires

## Snapshots (for miners + quorum)

MVP:
- miners/verifiers compute stake weights off-chain
- an allowlisted snapshot submitter posts `StakeSnapshot(epoch_id, root, total_weight)`
- quorum programs and miners use the snapshot root as a stable reference point for the epoch

End-State (planned):
- permissionless snapshot submission with dispute windows
- stake-weighted committees verifying snapshots
- slashing for provably incorrect snapshots

## MVP vs End-State

**MVP ✅**
- authority-managed verifier registry
- allowlisted snapshot submitters
- allowlisted slash authorities
- off-chain evidence and audits

**End-State 🔮**
- permissionless verifier onboarding (stake-gated)
- evidence-based slashing, dispute resolution
- delegated-stake slashing opt-in (insurance pools)
- stake-weighted governance for parameter updates

