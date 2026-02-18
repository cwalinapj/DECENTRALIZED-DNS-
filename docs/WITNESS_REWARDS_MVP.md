# Witness Rewards (MVP)

This page is the definition-of-done runbook for `ddns_witness_rewards`.

## Scope
- Program: `solana/programs/ddns_witness_rewards`
- Program ID: `HTd88EzMhvsWjNwMnrt6mquChgogjmdQTbSmDzwps975`
- Trust model (MVP): permissionless batch submissions, no per-receipt on-chain signature verification.

## Compile + Wiring Checks
Run from repo root:

```bash
cd solana
cargo metadata --no-deps
cargo check -p ddns_witness_rewards
anchor build --program-name ddns_witness_rewards
cargo test -p ddns_witness_rewards
```

Expected:
- `cargo metadata` succeeds and includes `programs/ddns_witness_rewards` in workspace members.
- `anchor build --program-name ddns_witness_rewards` succeeds.
- `cargo test -p ddns_witness_rewards` passes.

## Anchor Wiring
Confirm `solana/Anchor.toml` has:
- `[programs.devnet].ddns_witness_rewards = "HTd88EzMhvsWjNwMnrt6mquChgogjmdQTbSmDzwps975"`
- `[programs.localnet].ddns_witness_rewards = "HTd88EzMhvsWjNwMnrt6mquChgogjmdQTbSmDzwps975"`

## Minimal CLI
Script:
- `solana/scripts/witness_rewards.ts`

NPM command:

```bash
npm -C solana run witness-rewards -- status \
  --rpc https://api.devnet.solana.com \
  --program-id HTd88EzMhvsWjNwMnrt6mquChgogjmdQTbSmDzwps975 \
  --miner <MINER_PUBKEY>
```

Output includes:
- PDA derivations: `config`, `vaultAuthority`, `bond`, `epochState`, `epochStats`
- decoded account payloads when accounts exist.

## Notes
- If CLI reports `missing_idl`, build the program first:

```bash
cd solana
anchor build --program-name ddns_witness_rewards
```
