# Rent Reserve Bond (MVP v1)

## What this is
- `ddns_rent_bond` is a planning + reserve-custody program.
- It tracks a reserve target and a reserve account balance.
- It does **not** claim that Solana rent can be bypassed.

## Important reality
- Solana rent-exempt accounts still require lamports.
- Staking/yield can help fund reserves and ops over time, but cannot remove rent requirements.
- MVP here is deterministic accounting + planning, not autonomous validator staking.

## Program scope (MVP)
- `init_config`: create config + reserve PDAs.
- `set_tracked_programs`: update tracked-program hash/count and validator allowlist hash/count.
- `recalc_targets`: update reserve target from inventory inputs.
- `deposit_reserve`: transfer SOL into reserve PDA.
- `withdraw_reserve` (authority-only): withdraw while keeping reserve account rent-exempt.

## Reserve formula
- `reserve_target = max(5 SOL, (2 × largest_program_lamports) + 1 SOL + optional_extras)`

## Commands (copy/paste)
```bash
npm run devnet:inventory:required
npm run devnet:inventory:all
npm run devnet:deploy:all
npm run rent:bond:audit
npm run rent:bond:keepalive
```

## Output artifacts
- `artifacts/devnet_inventory.json`
- `artifacts/devnet_inventory.md`
- `artifacts/rent_bond_report.json`
- `artifacts/rent_bond_report.md`

## Dashboard
- Open `docs/rent-bond/index.html` in a local static server.
- The page reads `artifacts/rent_bond_report.json` if present.
