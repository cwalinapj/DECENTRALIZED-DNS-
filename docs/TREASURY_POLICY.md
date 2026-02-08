# Treasury Policy

This policy defines how the treasury sells, caps, and allocates funds across utility budgets.

## Config
File: `config/treasury-policy.json`

Fields:
- `sell_bands`: tiered sell percentages by treasury size.
- `caps`: daily/monthly sell caps.
- `buckets`: utility budget allocation targets.

## Bucket validation (strict)
Each bucket must include exactly one of:
- `percent` (0–100)
- `fraction` (0–1)

Rules:
- `percent` and `fraction` cannot both be set.
- Sum of bucket fractions must be `<= 1.0`.
- Invalid buckets will cause `/treasury/allocate` to return an error.

## Coordinator endpoints
- `GET /treasury/policy`
- `GET /treasury/ledger`
- `POST /treasury/allocate` (admin token required)

## Utility budget allocator
The coordinator can compute allocations from the current treasury balance and policy buckets.

This is a **policy stub** for now; governance controls and execution are planned.
