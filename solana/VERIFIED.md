# VERIFIED (Devnet + Localnet)

Date: 2026-02-09

This file records reproducible verification steps and proof objects (program IDs, tx signatures, PDAs).

## Localnet (Design3)

```bash
cd solana
anchor build
anchor test --provider.cluster localnet
```

Expected:
- `tests/design3.ts` passes (stake + quorum CPI finalizes a canonical route)

## Devnet Deploy (Design3 Programs)

Program ids:

- `ddns_registry`: `5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx`
- `ddns_quorum`: `9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB`
- `ddns_stake`: `6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF`

Deploy tx signatures:

- `ddns_stake`: `4LL3nYmjm9on2cbV8Twh8eKJxMaqsyHiUWRURYphqXCPCBNwWqujKCBkKRHn8KXZFjjcAsnpqoJgj8iJ1u9Ljij6`
- `ddns_registry`: `3LhXu4tNmtihQWhsa8DgDab2hSMxkYKHUkfuUFG5q2XeQLDk62q2HRN48nS1thUfANm5SR6uXcsyhmD7bwqvo3fg`
- `ddns_quorum`: `5Teztre2gzMy1YcZYS3a4oBbZ8dBmmfBxazSvYMsZm3iqKm237uhbw9A5rytDo4mb3Tna1LcucEXesrVhC4Tavvg`

Optional:

```bash
solana program show -u devnet 5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx
solana program show -u devnet 9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB
solana program show -u devnet 6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF
```

## Devnet Deploy + Proof (ddns_domain_rewards)

Program id:

- `ddns_domain_rewards`: `7iFM5ZYPWpF2rK6dQkgeb4RLc2zTDnEgrTNVMp8n6s3m`

Deploy tx signature:

- `ddns_domain_rewards`: `3vzC7LhZH6eQzjYf6GhiVAcVpVHcVDsuQGSohaLFhxusBBZph95JQZqU1kmi5bjmGDLeaTzvL8s3yJm4udb4qtuc`

Proof: register a DomainOwner split + pay a toll that auto-splits to owner/miners/treasury.

Observed state (devnet):

- `config_pda`: `8B9Ztaep66bifkNmo8UAiGWAstuaJu8k3fYzTYzhbaPo`
- `toll_mint`: `834zbMe1ehALnMe6ZKKzd8rvU7PBgkPpoBPc45ZmewtS`
- `treasury_vault`: `3iTweq1rWXFxG5LEgysjvByTUXXyd4Tchm3AqFUWGUyF`
- `miners_vault`: `EjLzA6MK6ZsXikFNU2m2ZhRg5y8DYUVttvS7CpPqsvwS`

Name:

- `name`: `proofdemo2.dns`
- `name_hash_hex`: `400bc0165ad70651ffcfb5e6883392f20b84655297560ee423d641c40c2e73ca`
- `domain_owner_pda`: `FruL8LhUiZMJijfkMfc1T8iYqVxynXHZFqfQ4QDWiRsC`

Tx signatures:

- `tx_register_domain_owner`: `55AxamQwD2BoqgQDZ8qaVaUw4VfiXvKKFPVRphLewomyYvcdT8ncfWQuZm2xjfos9pJEcp83Fo93tHFk3BVgw6x5`
- `tx_toll_pay_for_route`: `22FYYNMrUCiNUCwuDbSb5dBWDpBLWFYUCkjAdmtzeHdDAJtX5TxXzz1baTqPBaVz5EZPcD8jQoS5nhLDayU26ZFb`

PDA proof command (example):

```bash
solana program show -u devnet 7iFM5ZYPWpF2rK6dQkgeb4RLc2zTDnEgrTNVMp8n6s3m
```

