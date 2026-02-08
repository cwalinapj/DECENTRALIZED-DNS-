# Treasury Policy

This policy defines how the treasury sells, caps, and allocates funds across utility budgets.

## Config
File: `config/treasury-policy.json`

Fields:
- `sell_bands`: tiered sell percentages by treasury size.
- `caps`: daily/monthly sell caps.
- `buckets`: utility budget allocation targets.

## Coordinator endpoints
- `GET /treasury/policy`
- `GET /treasury/ledger`
- `POST /treasury/allocate` (admin token required)

## Utility budget allocator
The coordinator can compute allocations from the current treasury balance and policy buckets.

This is a **policy stub** for now; governance controls and execution are planned.
