# PR2 Verification (Design 3 Programs)

Date: 2026-02-09

## Commands Run (Localnet)

```bash
cd solana
anchor build
anchor test --provider.cluster localnet
```

Result:

- `anchor test` passed:
  - `tests/design3.ts` ("stakes + claims rewards; finalizes canonical route via quorum CPI")
  - `tests/ddns_rewards.ts` ("verifies a claim (authority), pays revenue share, submits usage, and claims epoch bonus")
  - `tests/ddns_operators.ts` ("registers operator, stakes, submits metrics, and claims rewards (TOLL)")

## Devnet Deploy (Programs)

Deployed via:

```bash
cd solana
anchor deploy --provider.cluster devnet
```

Program ids:

- `ddns_registry`: `5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx`
- `ddns_quorum`: `9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB`
- `ddns_stake`: `6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF`

Deploy tx signatures:

- `ddns_stake`: `4LL3nYmjm9on2cbV8Twh8eKJxMaqsyHiUWRURYphqXCPCBNwWqujKCBkKRHn8KXZFjjcAsnpqoJgj8iJ1u9Ljij6`
- `ddns_registry`: `3LhXu4tNmtihQWhsa8DgDab2hSMxkYKHUkfuUFG5q2XeQLDk62q2HRN48nS1thUfANm5SR6uXcsyhmD7bwqvo3fg`
- `ddns_quorum`: `5Teztre2gzMy1YcZYS3a4oBbZ8dBmmfBxazSvYMsZm3iqKm237uhbw9A5rytDo4mb3Tna1LcucEXesrVhC4Tavvg`

Optional confirmation commands:

```bash
solana program show -u devnet 5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx
solana program show -u devnet 9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB
solana program show -u devnet 6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF
```

## Devnet Deploy (ddns_rewards)

Program id (generated via `anchor keys sync`):

- `ddns_rewards`: `8GQJrUpNhCFodqKdhEvWub6pjTtgoXBtBZUqxeEDujAY`

Attempted deploy command:

```bash
cd solana
anchor deploy --provider.cluster devnet --program-name ddns_rewards
```

Blocked as of 2026-02-09:

- Deploy wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- Error: insufficient funds (needed ~`3.235 SOL` + fee; wallet had ~`2.514 SOL`)
- Faucet attempts (`solana airdrop -u devnet ...`) were rate-limited.

Once wallet balance is topped up, re-run:

```bash
anchor deploy --provider.cluster devnet --program-name ddns_rewards
solana program show -u devnet 8GQJrUpNhCFodqKdhEvWub6pjTtgoXBtBZUqxeEDujAY
```

## Devnet Deploy (ddns_operators)

Program id (generated via `anchor keys sync`):

- `ddns_operators`: `3Q5VCoAT4TZ9xMrpbt4jbN9LhHfihxGH3TiD6PmSqHhp`

Localnet proof:

```bash
cd solana
anchor test --provider.cluster localnet
```

Devnet deploy command (blocked until deploy wallet has sufficient SOL):

```bash
cd solana
anchor deploy --provider.cluster devnet --program-name ddns_operators
solana program show -u devnet 3Q5VCoAT4TZ9xMrpbt4jbN9LhHfihxGH3TiD6PmSqHhp
```

Blocked as of 2026-02-09:

- Deploy wallet: `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`
- Error: insufficient funds (needed ~`2.905 SOL` + fee; wallet had ~`2.514 SOL`)
