# PR2 Verification (Design 3 Programs)

Date: 2026-02-09

## Commands Run (Localnet)

```bash
cd solana
anchor build
anchor test
```

Result:

- `anchor test` passed: `tests/design3.ts` ("stakes + claims rewards; finalizes canonical route via quorum CPI")

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

