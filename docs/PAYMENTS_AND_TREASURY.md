# Payments and Treasury (USD-first with crypto rails)

## Canonical pricing

- All plans and renewals are priced in USD.
- USD pricing is the source of truth shown to users.

## Payment rails

- Supported rails: cards/ACH and crypto (BTC/ETH/SOL/USDC and other supported assets).
- Recommendation: USD/card checkout for least friction.

## Provider adapter (MVP mock now, real processors later)

- The codebase uses a `PaymentsProvider` adapter contract so checkout integrations are pluggable.
- Current MVP implementation is `mock` only, behind `PAYMENTS_MOCK_ENABLED=1` for local/dev testing.
- Planned real adapters include Stripe (card/ACH) and a crypto processor, both wired to the same quote/checkout/status contract.
- No live payment keys are required for MVP flows in this repository.

## Quote lock (crypto checkout)

- Crypto checkout uses a short-lived quote lock (typically 60-120 seconds).
- This limits price drift during payment authorization.
- If a quote expires before payment confirmation, checkout returns a new quote and refreshed payment amount in crypto units while USD price remains unchanged.
- Expired quotes are never auto-charged.

## Settlement model

- Crypto payments settle to USDC (default) or USD treasury balances.
- Treasury policy avoids relying on long-duration volatile holdings for user commitments.
- Treasury target is to neutralize volatility risk quickly after payment confirmation, with stable settlement as the default path.

## Hedge posture (MVP-safe)

- Reserve posture targets mostly stable balances (USDC/USD equivalent).
- Keep a SOL hot buffer for operational chain costs.
- Baseline runway target: maintain at least 30 days of projected SOL operational spend in hot reserves.
- Rebalance on a fixed cadence (for example daily/weekly policy windows) and on threshold breaches (for example hot buffer below target).

## Refunds and chargebacks

- Refunds are calculated in USD terms.
- Crypto refunds may be issued as stablecoin-equivalent value based on policy at refund time.

## Fraud and abuse controls

- Rate limits apply to payment-sensitive and subsidy-sensitive endpoints.
- Resource-heavy hosting tiers are escrow/bond gated; there is no unlimited free resource tier.
- High-risk abuse signals (spam/malware/churn) can suspend subsidy eligibility under policy controls.

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
