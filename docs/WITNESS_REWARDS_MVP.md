# Witness Rewards (MVP)

This page is the definition-of-done runbook for `ddns_witness_rewards`.

## Scope

- Program: `solana/programs/ddns_witness_rewards`
- Program ID (devnet): `AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge`
- Trust model (MVP): permissionless batch submissions, bond-gated, no per-receipt on-chain signature verification.

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

- `[programs.devnet].ddns_witness_rewards = "AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge"`
- `[programs.localnet].ddns_witness_rewards = "AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge"`

## Minimal CLI

Script:

- `solana/scripts/witness_rewards.ts`

Help:

```bash
npm -C solana run witness-rewards -- --help
```

Status (prints PDAs and decodes accounts if they exist):

```bash
npm -C solana run witness-rewards -- status \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --miner <MINER_PUBKEY>
```

## End-to-End Devnet Demo (Init/Fund/Bond/Submit/Claim)

Devnet is the reference environment for MVP proofs. This flow creates a new mint (TOLL) and funds a reward vault.

```bash
# 0) Install deps
npm -C solana install

# 1) Build (generates IDL)
(cd solana && anchor build --program-name ddns_witness_rewards)

# 2) Init config (creates new mint + reward vault; mints 10 TOLL to your ATA)
npm -C solana run witness-rewards -- init-config \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --epoch-len-slots 100 \
  --mint-to-self 10000000000

# 3) Deposit SOL bond
npm -C solana run witness-rewards -- deposit-bond \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --lamports 10000000

# 4) Fund reward vault (5 TOLL)
npm -C solana run witness-rewards -- fund-reward-vault \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --amount 5000000000

# 5) Submit batch
npm -C solana run witness-rewards -- submit-batch \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --root-hex 0x1111111111111111111111111111111111111111111111111111111111111111 \
  --receipt-count 10 \
  --unique-names 5 \
  --unique-colos 2

# 6) Claim (use epoch printed by submit-batch)
npm -C solana run witness-rewards -- claim \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --epoch <EPOCH_ID>
```

## Proofs

Devnet proof outputs and PDA/account proof commands live in `solana/VERIFIED.md`.

## Notes

- If CLI reports `missing_idl`, build the program first:

```bash
cd solana
anchor build --program-name ddns_witness_rewards
```
