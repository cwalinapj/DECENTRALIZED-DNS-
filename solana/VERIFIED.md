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

## Devnet Deploy + Proof (ddns_domain_rewards)

Program id:

- `ddns_domain_rewards`: `7iFM5ZYPWpF2rK6dQkgeb4RLc2zTDnEgrTNVMp8n6s3m`

Deploy command:

```bash
cd solana
anchor deploy --provider.cluster devnet --program-name ddns_domain_rewards
```

Deploy tx signature:

- `ddns_domain_rewards`: `3vzC7LhZH6eQzjYf6GhiVAcVpVHcVDsuQGSohaLFhxusBBZph95JQZqU1kmi5bjmGDLeaTzvL8s3yJm4udb4qtuc`

Proof: register a DomainOwner split + pay a toll that auto-splits to owner/miners/treasury.

Observed state (devnet):

- `config_pda`: `8B9Ztaep66bifkNmo8UAiGWAstuaJu8k3fYzTYzhbaPo`
- `toll_mint`: `834zbMe1ehALnMe6ZKKzd8rvU7PBgkPpoBPc45ZmewtS`
- `treasury_vault`: `3iTweq1rWXFxG5LEgysjvByTUXXyd4Tchm3AqFUWGUyF`
- `miners_vault`: `EjLzA6MK6ZsXikFNU2m2ZhRg5y8DYUVttvS7CpPqsvwS`

Domain owner + payment proof:

- `domain_owner_wallet`: `E5ai6dUZXJ5L52oS3jT2FCmABLL73QPvJ52tKB7RU7o8`
- `fund_domain_owner_sig`: `4oygEih4NX46XwXueyVKSYTrRSbuGfzLzrZ17XkkFbY1oPfDL4Kqw5ftX2QyQ1btiGvWSJJHUf7NAK5SRDGXb3Yi`
- `owner_ata`: `3na9qnbN7N9nGoZZhuvxwUimMVuFAgVGJRPA5GcfowKe`
- `create_owner_ata_sig`: `5MseQrvrQxkMf9quv8kUza6pw2iHEUq91v1oQ6Cj34LQV3wjvkQRa8ihGYUDN7c1rPV5GDpxP4Y1DuePoA3QN7Dy`

Name:

- `name`: `proofdemo2.dns`
- `name_hash_hex`: `400bc0165ad70651ffcfb5e6883392f20b84655297560ee423d641c40c2e73ca`
- `domain_owner_pda`: `FruL8LhUiZMJijfkMfc1T8iYqVxynXHZFqfQ4QDWiRsC`
- `tx_register_domain_owner`: `55AxamQwD2BoqgQDZ8qaVaUw4VfiXvKKFPVRphLewomyYvcdT8ncfWQuZm2xjfos9pJEcp83Fo93tHFk3BVgw6x5`

Toll payment split:

- `tx_toll_pay_for_route`: `22FYYNMrUCiNUCwuDbSb5dBWDpBLWFYUCkjAdmtzeHdDAJtX5TxXzz1baTqPBaVz5EZPcD8jQoS5nhLDayU26ZFb`

Balances after the toll payment (human units):

- payer ATA: `18.15`
- owner ATA: `0.15`
- treasury vault: `1.4`
- miners vault: `0.3`

Optional confirmation:

```bash
solana program show -u devnet 7iFM5ZYPWpF2rK6dQkgeb4RLc2zTDnEgrTNVMp8n6s3m
```
