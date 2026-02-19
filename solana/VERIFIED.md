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


## ddns_names + premium reward gate (localnet verification)

Date (UTC): 2026-02-18
Branch: `codex/pr-ddns-names-premium-gate`

Commands run:

```bash
cd solana
cargo check -p ddns_names
anchor build --program-name ddns_names
anchor test --skip-build tests/ddns_miner_score.ts tests/ddns_names.ts
npm run names -- --help
npm run names -- resolve-primary --owner B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5 --rpc https://api.devnet.solana.com
```

Results:

- `cargo check -p ddns_names`: success
- `anchor build --program-name ddns_names`: success
- `anchor test --skip-build tests/ddns_miner_score.ts tests/ddns_names.ts`: `10 passing (2m)`
- names CLI help prints commands: `init-config`, `claim-sub`, `buy-premium`, `set-primary`, `resolve-primary`
- `resolve-primary` output example:

```json
{
  "owner": "B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5",
  "primaryPda": "HPohhMscN6QnLieNxZnST1zSj1dAmWcKZFbcveF3Akrg",
  "primary": null
}
```

PDAs and seeds used in tests:

- `NamesConfig`: `["names_config"]`
- `PremiumName`: `["premium", name_hash]`
- `SubName`: `["sub", parent_hash, label_hash]`
- `PrimaryName`: `["primary", wallet_pubkey]`
- `ParentPolicy`: `["parent_policy", parent_hash]`

Gate behavior proven in tests:

- `alice.user.dns` transfer fails (non-transferable)
- `bob.alice.dns` transfer fails without parent co-sign and succeeds with parent co-sign
- sellable reward claim fails without premium account proof and succeeds after buying premium

## Devnet deploy + funding audit (MVP gate)

Date (UTC): 2026-02-19
Branch: `codex/main-ops`

Commands run:

```bash
npm -C solana i --include=dev
npm -C solana run devnet:verify
npm -C solana run devnet:audit
```

Output snippets:

```text
> ddns-anchor@0.1.0 devnet:verify
> tsx scripts/devnet_verify_deployed.ts --rpc https://api.devnet.solana.com

✅ all required programs are deployed (6)
```

```text
> ddns-anchor@0.1.0 devnet:audit
> tsx scripts/devnet_audit.ts --rpc https://api.devnet.solana.com

Wrote /Users/root1/scripts/ddns-main-ops/docs/DEVNET_STATUS.md
Programs audited: 15
Total program SOL: 0.006848640
Deploy wallet SOL: 11.945643640
Recommended reserve SOL: 5.000000000 (OK)
```

Notes:

- `docs/DEVNET_STATUS.md` is generated from `solana/Anchor.toml` `[programs.devnet]`.
- `devnet:verify` checks the MVP-required set by default:
  `ddns_anchor, ddns_registry, ddns_quorum, ddns_stake, ddns_domain_rewards, ddns_rewards`.
- Override required set with:
  `DDNS_REQUIRED_MVP_PROGRAMS=prog1,prog2,... npm -C solana run devnet:verify`.
