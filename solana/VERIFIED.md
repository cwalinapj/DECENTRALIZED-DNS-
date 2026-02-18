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


## ddns_witness_rewards (DEVNET)

- Date: 2026-02-18
- Branch: `codex/pr-witness-rewards-devnet-dod`
- RPC: `https://api.devnet.solana.com`

### Program

- Program ID: `AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge`
- Deploy tx: `3iwB8SUTej49FCstVCZJJzv7FDgJBEx4TDYi2bxpaXtiGS2eScouWQaTQYeokMivZmhmS4Af8CtTNUHECXVrZKT8`
- IDL account: `58BwbU74J2zaueZrVJsHqZ2a4eND8V4jyBp9PZh3YT6`

Proof:
```bash
solana program show -u devnet AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge
```

### PDAs / Accounts

- Config PDA: `D6JJXiAKeKUnf6eY3Q7NKG3VfZAbGvntCfq3JiQUXzV8`
- Vault authority PDA: `EzhMkxAaAH9YJuyTMX2Ca4FxsFQLmnithMVczCeru9S9`
- Miner bond PDA (miner = `B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5`): `EYuB4i3CvSfAypzFCK6tqGZu26SKD75CctHYgFVxaovZ`

- Toll mint (created by script): `5uCfjyvp6AWHgGgwuNAssSNtWLzJYsWZrUdG56h5Dcxz`
- Reward vault (token acct, owned by vault authority PDA): `2XjteyGkbhuPxBjtjvEif2oV8ND4o9UKoam5v4TKNnNV`
- Miner ATA (TOLL): `5iSaGoAuNBGNahy3sWkLm9BLP6ACm11F9Y4uP8o5PF8`

- Epoch ID used in test: `4430603`
- Epoch state PDA: `Djz4E76tAzZH15U1PVzCWVmBCvsmXwsKzvc8c6ZtXpab`
- Epoch miner stats PDA: `5nd24EmVbMymDrYscMMTh8a5kdSBk7deLGDLF8fJn1ub`

Account proofs:
```bash
solana account -u devnet D6JJXiAKeKUnf6eY3Q7NKG3VfZAbGvntCfq3JiQUXzV8 --output json
solana account -u devnet EYuB4i3CvSfAypzFCK6tqGZu26SKD75CctHYgFVxaovZ --output json
solana account -u devnet Djz4E76tAzZH15U1PVzCWVmBCvsmXwsKzvc8c6ZtXpab --output json
solana account -u devnet 5nd24EmVbMymDrYscMMTh8a5kdSBk7deLGDLF8fJn1ub --output json
solana account -u devnet 2XjteyGkbhuPxBjtjvEif2oV8ND4o9UKoam5v4TKNnNV --output json
solana account -u devnet 5iSaGoAuNBGNahy3sWkLm9BLP6ACm11F9Y4uP8o5PF8 --output json
```

### Devnet Flow (CLI)

1) Init config (+ create mint + reward vault; mint 10 TOLL to authority ATA)

- Tx: `RVwtCZuVVE4bGnDj16yDB11bNXzQQZr6XaDk8o1gpiAt1DLVkXusau5UYimoyksxjdbK6gmiyNJpeMpzQspMjM4`

```bash
npm -C solana run witness-rewards -- init-config \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --epoch-len-slots 100 \
  --mint-to-self 10000000000
```

2) Deposit bond (0.01 SOL)

- Tx: `F2QUhe1LYnQf5KXcGFBdATMwKK3phajE9MsF7RrnjjrqhKijXK5DiHRKA5PyBYY9WG1wcec24kd99NBaRCCv6cF`

```bash
npm -C solana run witness-rewards -- deposit-bond \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --lamports 10000000
```

3) Fund reward vault (5 TOLL)

- Tx: `3pzZpTjsWCmyArTBAF7fm3z74y6t9DCj33AhVZ8T4S7886wDnJyVoELpj4oxqFNDhdUzkTYo2Vtbi7yVZeYjBkAh`

```bash
npm -C solana run witness-rewards -- fund-reward-vault \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --amount 5000000000
```

4) Submit batch

- Tx: `5MBo9DX2vok6vzyCj6whk4acPjVjeeXCVgrxccS5qXEUcxfeYd1LH1cCwqJ3Wq5zbagfUEvufLUR2kwkuYfEy1c9`

```bash
npm -C solana run witness-rewards -- submit-batch \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --root-hex 0x1111111111111111111111111111111111111111111111111111111111111111 \
  --receipt-count 10 \
  --unique-names 5 \
  --unique-colos 2
```

5) Claim

- Tx: `5LvyAUyekZLTgo5PPSvqDNHyXbn9rkUrKpkH2nrgAppBYJK5qtTcwhuMgo2tK2eAzGXzctocsHuMsKBT5UgTxzWN`

```bash
npm -C solana run witness-rewards -- claim \
  --rpc https://api.devnet.solana.com \
  --program-id AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge \
  --epoch 4430603
```

### Permissionless Miner Proof (Second Wallet)

Miner keypair file (not committed): `~/.config/solana/ddns_miner_devnet.json`

- Miner pubkey: `8R3YkaD34TT41jcCdK4LiGwa3qXUWsQfFpXBto2bWWMN`
- Funding transfer (authority -> miner 0.05 SOL): `5qq1bfduCuZuSE3jcHvJLNTnh9krgWeGNhRSSrJMc6buFkFQ5q582X1WvT6MRdeFuL2AMxytUBskw5dzNp5bCUCg`

Bond:

- Bond PDA: `7igky1yZjoVx17yFNaEoYRV4PKoKoPuMZY3syCf7eedV`
- Tx deposit_bond: `2J8U8qfcUD2WgTATXSYMUmEso8M2MRivFUvp54zTGjUCHcRTvYbyFbDZ5wuxWW1ZhDbgLbibauKtYtfdW3wG3EhY`

Batch + claim:

- Epoch ID: `4430638`
- Epoch state PDA: `7kFjLrZ1Cr3LM9SnjvXjqaj5oyJQa4Ar5PAiYidurTAK`
- Epoch stats PDA: `5ii66GBN3Nc7Np4oo2TMMW25EaLcfpFFfdQVtWFinG8G`
- Tx submit_batch: `EmhTKsD2CP861CKi7fKTMNppnKQKXr2UAjCwdPaq34muXA7M69Et2jEp2TCNLkXifmAvdp7LsAoYpTJXbUnVECk`
- Miner ATA (TOLL): `B1btLse5QsiRFWTa2XZfrSUyhXi7HPmYo5mFHx18yYYJ`
- Tx claim: `3TgsSADsegfFNJhWA6xVpTd6YATjkHvTummghrxr2JtRvJ1EWGpLehcgxTojqCiVAfoFknHDZuFyughW2Ja71VZS`

Proof commands:

```bash
# preflight
solana config set -u https://api.devnet.solana.com
solana address
solana balance

# verify program
solana program show -u devnet AVsmrpWUMLsdaHr5Y8p2N96fBMPTHVV7WLz8iiu4nBge

# verify PDAs (config + reward vault)
solana account -u devnet D6JJXiAKeKUnf6eY3Q7NKG3VfZAbGvntCfq3JiQUXzV8 --output json
spl-token supply 5uCfjyvp6AWHgGgwuNAssSNtWLzJYsWZrUdG56h5Dcxz -u devnet
spl-token account-info -u devnet --address 2XjteyGkbhuPxBjtjvEif2oV8ND4o9UKoam5v4TKNnNV --output json

# verify second-miner bond + epoch accounts
solana account -u devnet 7igky1yZjoVx17yFNaEoYRV4PKoKoPuMZY3syCf7eedV --output json
solana balance -u devnet 7igky1yZjoVx17yFNaEoYRV4PKoKoPuMZY3syCf7eedV
solana account -u devnet 7kFjLrZ1Cr3LM9SnjvXjqaj5oyJQa4Ar5PAiYidurTAK --output json
solana account -u devnet 5ii66GBN3Nc7Np4oo2TMMW25EaLcfpFFfdQVtWFinG8G --output json

# verify token balances
spl-token balance 5uCfjyvp6AWHgGgwuNAssSNtWLzJYsWZrUdG56h5Dcxz --owner 8R3YkaD34TT41jcCdK4LiGwa3qXUWsQfFpXBto2bWWMN -u devnet
spl-token balance -u devnet --address 2XjteyGkbhuPxBjtjvEif2oV8ND4o9UKoam5v4TKNnNV
spl-token account-info -u devnet --address B1btLse5QsiRFWTa2XZfrSUyhXi7HPmYo5mFHx18yYYJ --output json
```

### Negative Test (Devnet)

Attempted to claim twice (expected failure):

- Command: re-run `claim --epoch 4430638`
- Error: `AlreadyClaimed` (Error Number: 6009)
