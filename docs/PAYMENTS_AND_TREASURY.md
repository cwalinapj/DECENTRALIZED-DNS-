# Payments and Treasury (USD-first with crypto rails)

## Canonical pricing

- All plans and renewals are priced in USD.
- USD pricing is the source of truth shown to users.

## Payment rails

- Supported rails: cards/ACH and crypto (BTC/ETH/SOL/USDC and other supported assets).
- Recommendation: USD/card checkout for least friction.

## Quote lock (crypto checkout)

- Crypto checkout uses a short-lived quote lock (typically 60-120 seconds).
- This limits price drift during payment authorization.

## Settlement model

- Crypto payments settle to USDC (default) or USD treasury balances.
- Treasury policy avoids relying on long-duration volatile holdings for user commitments.

## Hedge posture (MVP-safe)

- Reserve posture targets mostly stable balances (USDC/USD equivalent).
- Keep a SOL hot buffer for operational chain costs.
- Rebalance periodically to maintain runway targets.

## Refunds and chargebacks

- Refunds are calculated in USD terms.
- Crypto refunds may be issued as stablecoin-equivalent value based on policy at refund time.

## Continuity + failed payment

- Renewal issues should not fail silently.
- Continuity banner/notice flows are used first (policy-gated) before release windows close.
- Domain handling remains bounded by registrar/registry rules.

## MVP scope boundaries

- No derivatives/perps in MVP.
- No algorithmic stablecoin dependencies in MVP.
- No user-managed hedging required.

## Operator notes

- This document is treasury/operator policy framing.
- End users should be directed to `docs/START_HERE.md` and `docs/WEB2_PRICING_MODEL.md`.
