# Status (MVP vs End State)

Last updated: 2026-02-09

## What Works Today (MVP)

- [x] Solana devnet program deployed: `ddns_anchor` (Passport/TollPass + name record writes)
- [x] Mint TollPass for a wallet (devnet) via `solana/scripts/mint_toll_pass.ts`
- [x] Tollbooth verifier service runs locally: `services/toll-booth` (witness quorum + on-chain toll pass existence check)
- [x] Submit a route with witness quorum -> write on-chain record (devnet) via `solana/scripts/set_route.ts`

## Design 3 (Cache-as-Witness + Staking) MVP Building Blocks

- [x] Programs implemented: `ddns_registry`, `ddns_quorum`, `ddns_stake`
- [x] Programs deployed to devnet
- [x] Localnet test passes: stake -> claim -> submit aggregate -> finalize canonical route via CPI
- [ ] CLI for stake/receipt creation/submission (PR3)
- [ ] Miner witness daemon (PR3)

## Centralization Disclaimer (MVP Bootstrap)

MVP includes centralized components:

- A gateway/tollbooth service can be the “default” writer/submitter
- Miners/verifiers can be allowlisted in MVP
- Receipt verification is performed off-chain in MVP

Clients can still verify what matters from chain state (PDA accounts) and retain local cache.

## Devnet Deployments (Verified)

Program ids:

- `ddns_anchor`: `9hwvtFzawMZ6R9eWJZ8YjC7rLCGgNK7PZBNeKMRCPBes`
- `ddns_registry`: `5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx`
- `ddns_quorum`: `9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB`
- `ddns_stake`: `6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF`

Deploy tx signatures (2026-02-09):

- `ddns_stake`: `4LL3nYmjm9on2cbV8Twh8eKJxMaqsyHiUWRURYphqXCPCBNwWqujKCBkKRHn8KXZFjjcAsnpqoJgj8iJ1u9Ljij6`
- `ddns_registry`: `3LhXu4tNmtihQWhsa8DgDab2hSMxkYKHUkfuUFG5q2XeQLDk62q2HRN48nS1thUfANm5SR6uXcsyhmD7bwqvo3fg`
- `ddns_anchor`: `5wezCaMirMnkNKbjWppdLb4K6higsR86uGf6c4aYAmezp24aHbhfLEuMWntJ18fCNSCohL24NLJV1SscAinNPmQ3`
- `ddns_quorum`: `5Teztre2gzMy1YcZYS3a4oBbZ8dBmmfBxazSvYMsZm3iqKm237uhbw9A5rytDo4mb3Tna1LcucEXesrVhC4Tavvg`

## MVP Devnet End-to-End (Verified)

This proves “shippable today” for the current MVP:

1. Fund test owner wallet (tx):

- `ULU2tdT5SyyBp6USSw8QStNcCzNt3tBsrwoi6QB3KUHV3rta4G5nb9t6RbGu96pmFZj64JhBNGPzA9fZ6NZXJRZ`

2. Mint TollPass (ddns_anchor `issue_toll_pass`) (tx):

- `4JFCsqiMwPZ5exhMvcSfXueuwBRXMVRM1QAb4soTncTrR7qmnBoRuC5nWNn6HJd68MKPW1YtAv2CzT8fEDGBjaUy`

Outputs:

- owner wallet: `EA5m944vNnmAYknTMF2fnSdCouqmJnj9Eev5cTzaU2Wg`
- toll_pass PDA: `7mY4VesuZbKDyWGWdAhBCgzNT8mtG4UKh89pYS9Lv1zq`
- mint: `73dsaerLysPmaTaQrf1oneu5hD9cdHLkaWPhcqFcbJcx`

3. Submit route with witness quorum (local toll-booth) + write on-chain name record (tx):

- toll-booth accepted route_id: `ab2f0682ff102df07532f29893b037b5620f2debd2781aefb5572eef4cf3d5b0`
- on-chain tx: `2uWiHYhNBwMU9cqwGsrgYd9XoAjrVAWA9n1fartoQb5UQrpLewBY9wFLnCAzN2DWVssuiPFd7HbeFkMGHPyqGLRE`

Hashes / proof pointers:

- name: `ea5m123.dns`
- `name_hash`: `32e1cdf368103a48f7c44807d5a2e1b9d1a949d481d4ea38f47a62c2fec9e3d7`
- dest: `https://example.com`
- `dest_hash`: `100680ad546ce6a577f42f52df33b4cfdca756859e664b8d7de329b150d09ce9`
- name record PDA (ddns_anchor `["name", name_hash]`): `9uK735cEkShaWjXw96tMVgWY4dtTT1e9cxzwEt7dr3N8`

## Next Milestones

- PR3: CLI scripts for stake/claim + make receipt + submit receipt batch
- PR3: miner witness daemon (off-chain receipt verification + aggregation + on-chain submit/finalize)
- Future: on-chain receipt/stake proof verification, rotating committees, slashing, DYDNS/IPFS

