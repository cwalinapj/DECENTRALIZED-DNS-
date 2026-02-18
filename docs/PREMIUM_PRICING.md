# Premium .dns Pricing (MVP)

## Scope

This defines MVP premium pricing for short second-level `.dns` names and reservation rules.

- Applies to premium labels where length `L <= 4`.
- Uses deterministic log-scale multipliers from config.
- Reserves 1-2 character labels to treasury authority in MVP.

## Config Inputs

- `P4_SOL` (`u64` lamports): base price for 4-character premium labels.
- `R_BPS` (`u64` basis points): per-character multiplier for shorter labels.
  - `R = R_BPS / 10_000`.

## Pricing Function

For `L in {1,2,3,4}`:

`price(L) = P4_SOL * R^(4-L)`

For `L >= 5`:

- Premium short-label surcharge is `0` in MVP.

## MVP Reservation Rule

- Labels with `L <= 2` are reserved.
- Only `config.treasury_authority` may mint/claim them.
- If a non-authority signer tries to mint `L <= 2`, transaction fails with `ReservedName`.

## Payment Flow

For premium purchases (`L <= 4`), the exact computed lamports are transferred to `config.treasury` (treasury vault/receiver).

## Example Table (P4 = 1 SOL, R = 10x)

- `L=4`: `1 SOL`
- `L=3`: `10 SOL`
- `L=2`: `100 SOL` (reserved to treasury authority in MVP)
- `L=1`: `1000 SOL` (reserved to treasury authority in MVP)

## Future (Not Implemented in MVP)

- 1-2 character premium names can move to on-chain auction/allocation.
- Reservation policy can be removed once auction/governance mechanisms are active.
